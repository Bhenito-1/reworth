"use client";

import { Button, Input } from "@reworth/ui-web";
import { hasSavedAddressLine } from "../../lib/saved-address";
import type { MeDeliveryAddress } from "../../lib/types";

type Props = {
  buyerFulfilment: "DELIVERY" | "MEET_POINT";
  onFulfilmentChange: (value: "DELIVERY" | "MEET_POINT") => void;
  showChoice: boolean;
  showMeetupOption: boolean;
  meetLocked: boolean;
  meetupLocationText?: string;
  meetupDeliveryDate?: string | null;
  onArrangeMeetup: () => void;
  meetupChatBusy: boolean;
  showAddress: boolean;
  savedDelivery: MeDeliveryAddress | null;
  addressMode: "saved" | "new";
  onAddressModeChange: (mode: "saved" | "new") => void;
  addressLine: string;
  onAddressLineChange: (value: string) => void;
  addressArea: string;
  onAddressAreaChange: (value: string) => void;
};

export function CheckoutDeliveryStep({
  buyerFulfilment,
  onFulfilmentChange,
  showChoice,
  showMeetupOption,
  meetLocked,
  meetupLocationText,
  meetupDeliveryDate,
  onArrangeMeetup,
  meetupChatBusy,
  showAddress,
  savedDelivery,
  addressMode,
  onAddressModeChange,
  addressLine,
  onAddressLineChange,
  addressArea,
  onAddressAreaChange,
}: Props) {
  return (
    <>
      <section className="mt-6" aria-labelledby="fulfil-heading">
        <h2 id="fulfil-heading" className="text-lg font-semibold">
          Delivery option
        </h2>
        {showChoice ? (
          <fieldset className="mt-3 flex flex-col gap-3">
            <legend className="sr-only">Delivery option</legend>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[var(--rw-radius-lg)] border px-4 py-3 ${
                buyerFulfilment === "DELIVERY"
                  ? "border-[var(--rw-accent)] bg-[var(--rw-accent-muted)]/30"
                  : "border-[var(--rw-border)]"
              }`}
            >
              <input
                type="radio"
                name="checkout-fulfilment"
                checked={buyerFulfilment === "DELIVERY"}
                onChange={() => onFulfilmentChange("DELIVERY")}
              />
              <span className="text-sm font-medium">ReWorth delivery</span>
            </label>
            {showMeetupOption ? (
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-[var(--rw-radius-lg)] border px-4 py-3 ${
                  buyerFulfilment === "MEET_POINT"
                    ? "border-[var(--rw-accent)] bg-[var(--rw-accent-muted)]/30"
                    : "border-[var(--rw-border)]"
                }`}
              >
                <input
                  type="radio"
                  name="checkout-fulfilment"
                  checked={buyerFulfilment === "MEET_POINT"}
                  onChange={() => onFulfilmentChange("MEET_POINT")}
                />
                <span className="text-sm font-medium">Meetup point</span>
              </label>
            ) : null}
          </fieldset>
        ) : meetLocked && meetupLocationText ? (
          <div className="mt-3 space-y-1 text-sm text-[var(--rw-ink-muted)]">
            <p>Meetup point · {meetupLocationText}</p>
            {meetupDeliveryDate ? (
              <p>
                Meetup date ·{" "}
                {new Date(meetupDeliveryDate).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {buyerFulfilment === "MEET_POINT" && !meetLocked && showMeetupOption ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full transition-opacity duration-150"
              disabled={meetupChatBusy}
              aria-busy={meetupChatBusy}
              onClick={onArrangeMeetup}
            >
              Arrange meetup
            </Button>
          </div>
        ) : null}
      </section>

      {showAddress ? (
        <section className="mt-6 space-y-3" aria-labelledby="addr-heading">
          <h2 id="addr-heading" className="text-lg font-semibold">
            Delivery address
          </h2>
          {savedDelivery && hasSavedAddressLine(savedDelivery) ? (
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Address source</legend>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="addressMode"
                  checked={addressMode === "saved"}
                  onChange={() => onAddressModeChange("saved")}
                />
                Use saved address (
                {[savedDelivery.line1, savedDelivery.community]
                  .filter(Boolean)
                  .join(", ")}
                )
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="addressMode"
                  checked={addressMode === "new"}
                  onChange={() => onAddressModeChange("new")}
                />
                Deliver somewhere else
              </label>
            </fieldset>
          ) : null}
          <Input
            label="Street / building"
            value={addressLine}
            onChange={(e) => onAddressLineChange(e.target.value)}
            placeholder="e.g. 12 Admiralty Way, Lekki Phase 1"
            disabled={
              addressMode === "saved" && hasSavedAddressLine(savedDelivery)
            }
          />
          <Input
            label="Area / city"
            value={addressArea}
            onChange={(e) => onAddressAreaChange(e.target.value)}
            placeholder="e.g. Lekki, Lagos"
            disabled={
              addressMode === "saved" && hasSavedAddressLine(savedDelivery)
            }
          />
        </section>
      ) : null}
    </>
  );
}