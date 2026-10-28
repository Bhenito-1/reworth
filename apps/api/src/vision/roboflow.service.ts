import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_ROBOFLOW_API_BASE,
  DEFAULT_ROBOFLOW_WORKFLOW_ID,
  DEFAULT_ROBOFLOW_WORKSPACE,
  DEFAULT_VISION_TIMEOUT_MS,
  readPositiveNumber,
  readThreshold,
} from './vision.config';
import { normalizeRoboflowBody } from './normalize-roboflow';
import {
  VISION_HTTP,
  type VisionErrorCode,
  type VisionHttp,
  type VisionImageEvidence,
} from './vision.types';

export type RoboflowImage =
  | { type: 'url'; value: string }
  | { type: 'base64'; value: string };

export type RoboflowCheckInput = {
  image: RoboflowImage;
  title: string;
  description?: string | null;
  imageKey?: string;
};

export type RoboflowCheckResult =
  | { ok: true; hit: VisionImageEvidence }
  | { ok: false; error: { code: VisionErrorCode; message: string } };

/**
 * HTTP client for the ReWorth Image-Title Check Roboflow workflow.
 * Inputs: image, title, and description. API key stays server-side.
 */
@Injectable()
export class RoboflowService implements OnModuleInit {
  private readonly logger = new Logger(RoboflowService.name);
  private readonly http: VisionHttp;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(VISION_HTTP) http?: VisionHttp,
  ) {
    this.http = http ?? fetch;
  }

  onModuleInit(): void {
    if (!this.apiKey()) {
      this.logger.warn(
        'ROBOFLOW_API_KEY is not set; image-title checks will require admin review',
      );
      return;
    }
    this.logger.log(
      `Roboflow vision workflow ${this.workspace()}/${this.workflowId()}`,
    );
  }

  workflowId(): string {
    return (
      this.config.get<string>('ROBOFLOW_WORKFLOW_ID')?.trim() ||
      DEFAULT_ROBOFLOW_WORKFLOW_ID
    );
  }

  missingConfigError(): { code: 'MISSING_CONFIG'; message: string } | null {
    if (this.apiKey()) return null;
    return {
      code: 'MISSING_CONFIG',
      message: 'ROBOFLOW_API_KEY is not configured',
    };
  }

  async checkImageTitle(input: RoboflowCheckInput): Promise<RoboflowCheckResult> {
    const missing = this.missingConfigError();
    if (missing) return { ok: false, error: missing };

    const apiKey = this.apiKey();
    const url = this.endpoint();
    const timeoutMs = readPositiveNumber(
      this.config.get<string | number>('VISION_TIMEOUT_MS'),
      DEFAULT_VISION_TIMEOUT_MS,
    );
    const payload = {
      api_key: apiKey,
      inputs: {
        image: input.image,
        title: cleanText(input.title, 2000),
        description: cleanText(input.description ?? '', 2000),
      },
    };

    let response: Response;
    try {
      response = await this.http(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeoutError(err)) {
        this.logger.warn({ imageKey: input.imageKey }, 'Roboflow vision timeout');
        return {
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: 'Roboflow image-title check timed out',
          },
        };
      }
      this.logger.warn(
        { imageKey: input.imageKey, err: safeErr(err) },
        'Roboflow vision unavailable',
      );
      return {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          message: 'Roboflow image-title check is unavailable',
        },
      };
    }

    return this.interpret(response, input.imageKey);
  }

  private async interpret(
    response: Response,
    imageKey?: string,
  ): Promise<RoboflowCheckResult> {
    const raw = await response.text();
    const safe = this.redact(raw).slice(0, 300);
    let body: unknown = null;
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const code = codeForStatus(response.status);
      this.logger.warn(
        { status: response.status, imageKey, body: safe },
        'Roboflow image-title check failed',
      );
      return { ok: false, error: { code, message: messageForStatus(code) } };
    }

    if (body == null) {
      this.logger.warn({ imageKey, body: safe }, 'Roboflow vision response was not JSON');
      return {
        ok: false,
        error: {
          code: 'MALFORMED_RESPONSE',
          message: 'Roboflow returned an unreadable image-title result',
        },
      };
    }

    const normalized = normalizeRoboflowBody(
      body,
      this.threshold(),
      imageKey,
    );
    if (!normalized.ok) {
      this.logger.warn({ imageKey }, 'Roboflow vision response was malformed');
      return normalized;
    }
    return { ok: true, hit: this.redactHit(normalized.hit) };
  }

  private endpoint(): string {
    const base = (
      this.config.get<string>('ROBOFLOW_API_BASE_URL')?.trim() ||
      DEFAULT_ROBOFLOW_API_BASE
    ).replace(/\/$/, '');
    const workspace = encodeURIComponent(this.workspace());
    const workflow = encodeURIComponent(this.workflowId());
    return `${base}/infer/workflows/${workspace}/${workflow}`;
  }

  private workspace(): string {
    return (
      this.config.get<string>('ROBOFLOW_WORKSPACE')?.trim() ||
      DEFAULT_ROBOFLOW_WORKSPACE
    );
  }

  private apiKey(): string {
    return this.config.get<string>('ROBOFLOW_API_KEY')?.trim() ?? '';
  }

  private threshold(): number {
    return readThreshold(
      this.config.get<string | number>('VISION_LOW_CONFIDENCE_THRESHOLD'),
    );
  }

  private redact(text: string): string {
    const key = this.apiKey();
    let out = text;
    if (key) out = out.split(key).join('[redacted]');
    return out.replace(/("api_key"\s*:\s*")[^"]+/gi, '$1[redacted]');
  }

  private redactHit(hit: VisionImageEvidence): VisionImageEvidence {
    return {
      ...hit,
      reason: this.redact(hit.reason),
      labels: hit.labels.map((label) => this.redact(label)),
      modelAnswer: hit.modelAnswer ? this.redact(hit.modelAnswer) : undefined,
      descriptionAnswer: hit.descriptionAnswer
        ? this.redact(hit.descriptionAnswer)
        : undefined,
    };
  }
}

function cleanText(value: string, max: number): string {
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: string }).name ?? '');
  const message = String((err as { message?: string }).message ?? '');
  return name === 'TimeoutError' || name === 'AbortError' || /timeout/i.test(message);
}

function safeErr(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return 'unknown error';
}

function codeForStatus(status: number): VisionErrorCode {
  if (status === 429) return 'RATE_LIMIT';
  if (status === 408) return 'TIMEOUT';
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return 'INVALID_IMAGE';
  }
  if (status >= 500) return 'UNAVAILABLE';
  return 'API_ERROR';
}

function messageForStatus(code: VisionErrorCode): string {
  switch (code) {
    case 'RATE_LIMIT':
      return 'Roboflow rate limit reached';
    case 'TIMEOUT':
      return 'Roboflow image-title check timed out';
    case 'INVALID_IMAGE':
      return 'Roboflow rejected the listing image';
    case 'UNAVAILABLE':
      return 'Roboflow image-title check is unavailable';
    case 'MISSING_CONFIG':
      return 'ROBOFLOW_API_KEY is not configured';
    case 'MALFORMED_RESPONSE':
      return 'Roboflow returned an unreadable image-title result';
    default:
      return 'Roboflow image-title check failed';
  }
}
