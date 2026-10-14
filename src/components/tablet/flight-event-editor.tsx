"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { BedDouble, CarFront, LoaderCircle, MapPin, Plane, PlaneLanding, PlaneTakeoff, Save, Trash2, X } from "lucide-react";
import { createFlightEvent, deleteFlightEvent, updateFlightEvent } from "@/app/admin/flight-actions";
import type { CalendarFlightEvent } from "@/lib/types";

type FlightEventEditorProps = {
  defaultDate: string;
  event?: CalendarFlightEvent | null;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
};

export function FlightEventEditor({ defaultDate, event, onClose, onDeleted, onSaved }: FlightEventEditorProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [departureDate, setDepartureDate] = useState(event?.departure_date ?? defaultDate);
  const [arrivalDate, setArrivalDate] = useState(event?.arrival_date ?? defaultDate);

  useEffect(() => {
    function closeOnEscape(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape" && !saving && !deleting) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleting, onClose, saving]);

  function handleBackdropClick(mouseEvent: MouseEvent<HTMLDivElement>) {
    if (mouseEvent.target === mouseEvent.currentTarget && !saving && !deleting) onClose();
  }

  async function save(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData(submitEvent.currentTarget);
      const result = event ? await updateFlightEvent(formData) : await createFlightEvent(formData);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The flight itinerary could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("id", event.id);
      const result = await deleteFlightEvent(formData);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onDeleted();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The flight itinerary could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="calendar-editor-backdrop tablet-editor-backdrop" onClick={handleBackdropClick} role="presentation">
      <form className="calendar-editor calendar-event-editor flight-event-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="flight-event-editor-title">
        <header>
          <div>
            <span><Plane size={13} /> {event ? "Edit flight itinerary" : "New flight itinerary"}</span>
            <h2 id="flight-event-editor-title">{event?.title ?? "Plan a flight"}</h2>
            <p>Times are stored exactly as entered for each local airport.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close flight editor" disabled={saving || deleting}><X size={17} /></button>
        </header>

        {event ? <input type="hidden" name="id" value={event.id} /> : null}
        <div className="flight-event-overview">
          <label>Trip title<input name="title" required minLength={2} maxLength={180} defaultValue={event?.title ?? ""} placeholder="e.g. Sydney campaign shoot" autoFocus /></label>
          <label>Trip notes<textarea name="notes" maxLength={4000} defaultValue={event?.notes ?? ""} placeholder="Booking notes, baggage, contacts or production details…" /></label>
        </div>

        <div className="flight-leg-grid">
          <fieldset className="flight-leg-card is-departure">
            <legend><PlaneTakeoff size={15} /> Departure</legend>
            <label className="flight-location-field"><MapPin size={12} /> From<input name="origin_location" required minLength={2} maxLength={180} defaultValue={event?.origin_location ?? ""} placeholder="Brisbane · BNE" /></label>
            <div>
              <label>Date<input type="date" name="departure_date" required value={departureDate} onChange={(changeEvent) => {
                const nextDate = changeEvent.target.value;
                setDepartureDate(nextDate);
                if (arrivalDate < nextDate) setArrivalDate(nextDate);
                setErrorMessage("");
              }} /></label>
              <label>Local time<input type="time" name="departure_time" required defaultValue={event?.departure_time.slice(0, 5) ?? "09:00"} /></label>
            </div>
            <label>Airline<input name="departure_airline" required minLength={2} maxLength={120} defaultValue={event?.departure_airline ?? ""} placeholder="Qantas" /></label>
            <label>Flight number <small>Optional</small><input name="departure_flight_number" maxLength={40} defaultValue={event?.departure_flight_number ?? ""} placeholder="QF 501" /></label>
          </fieldset>

          <div className="flight-route-divider" aria-hidden="true"><i /><Plane size={16} /><i /></div>

          <fieldset className="flight-leg-card is-arrival">
            <legend><PlaneLanding size={15} /> Arrival</legend>
            <label className="flight-location-field"><MapPin size={12} /> To<input name="destination_location" required minLength={2} maxLength={180} defaultValue={event?.destination_location ?? ""} placeholder="Sydney · SYD" /></label>
            <div>
              <label>Date<input type="date" name="arrival_date" required min={departureDate} value={arrivalDate} onChange={(changeEvent) => { setArrivalDate(changeEvent.target.value); setErrorMessage(""); }} /></label>
              <label>Local time<input type="time" name="arrival_time" required defaultValue={event?.arrival_time.slice(0, 5) ?? "11:00"} /></label>
            </div>
            <label>Airline <small>Defaults to departure airline</small><input name="arrival_airline" maxLength={120} defaultValue={event?.arrival_airline ?? ""} placeholder="Same airline" /></label>
            <label>Flight number <small>Optional</small><input name="arrival_flight_number" maxLength={40} defaultValue={event?.arrival_flight_number ?? ""} placeholder="QF 501" /></label>
          </fieldset>
        </div>

        <div className="flight-support-grid">
          <fieldset>
            <legend><BedDouble size={14} /> Accommodation <small>Optional</small></legend>
            <label>Title<input name="accommodation_title" maxLength={180} defaultValue={event?.accommodation_title ?? ""} placeholder="Hotel or apartment" /></label>
            <label>Location<input name="accommodation_location" maxLength={300} defaultValue={event?.accommodation_location ?? ""} placeholder="Address or suburb" /></label>
            <label>Notes<textarea name="accommodation_notes" maxLength={2000} defaultValue={event?.accommodation_notes ?? ""} placeholder="Check-in, confirmation or contact…" /></label>
          </fieldset>
          <fieldset>
            <legend><CarFront size={14} /> Vehicle <small>Optional</small></legend>
            <label>Title<input name="vehicle_title" maxLength={180} defaultValue={event?.vehicle_title ?? ""} placeholder="Hire car, transfer or parking" /></label>
            <label>Location<input name="vehicle_location" maxLength={300} defaultValue={event?.vehicle_location ?? ""} placeholder="Pickup point or depot" /></label>
            <label>Notes<textarea name="vehicle_notes" maxLength={2000} defaultValue={event?.vehicle_notes ?? ""} placeholder="Pickup time, reference or contact…" /></label>
          </fieldset>
        </div>

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        <footer>
          {event ? <button className="calendar-event-delete" type="button" onClick={() => { void remove(); }} disabled={saving || deleting}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Delete</button> : null}
          <span />
          <button type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || deleting}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> {event ? "Save itinerary" : "Create flight"}</>}</button>
        </footer>
      </form>
    </div>
  );
}
