"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { BedDouble, CarFront, ChevronDown, LoaderCircle, MapPin, Plane, PlaneLanding, PlaneTakeoff, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { createFlightPlan, deleteFlightPlan, updateFlightPlan } from "@/app/admin/flight-actions";
import { AirlineLogo } from "@/components/tablet/airline-logo";
import { AIRLINES, findAirline, findAirlineCodeByName } from "@/lib/airlines";
import type { CalendarFlightEvent } from "@/lib/types";

type FlightEventEditorProps = {
  defaultClientId?: string | null;
  defaultDate: string;
  event?: CalendarFlightEvent | null;
  flightEvents?: CalendarFlightEvent[];
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
};

type FlightLegFieldProps = {
  arrivalDate: string;
  defaultDepartureDate: string;
  fallbackDestination?: string;
  fallbackOrigin?: string;
  leg?: CalendarFlightEvent;
  onArrivalDateChange: (value: string) => void;
  onDepartureDateChange: (value: string) => void;
  prefix: "outbound" | "return";
  title: string;
};

function AirlineField({ defaultCode, defaultName, prefix }: { defaultCode?: string | null; defaultName?: string | null; prefix: "outbound" | "return" }) {
  const initialKnown = findAirline(defaultCode) ?? findAirline(findAirlineCodeByName(defaultName));
  const [selectedCode, setSelectedCode] = useState(initialKnown?.code ?? "OTHER");
  const [otherName, setOtherName] = useState(initialKnown ? "" : defaultName ?? "");
  const selected = findAirline(selectedCode);
  const airlineName = selected?.name ?? otherName;

  return (
    <div className="flight-airline-field">
      <span>Airline</span>
      <div className="flight-airline-select-wrap">
        <AirlineLogo code={selected?.code} name={airlineName || "Airline"} />
        <select name={`${prefix}_airline_code`} value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)} aria-label={`${prefix === "outbound" ? "Outbound" : "Return"} airline`}>
          <option value="" disabled>Select an airline</option>
          {AIRLINES.map((airline) => <option key={airline.code} value={airline.code}>{airline.name}</option>)}
          <option value="OTHER">Other airline / charter</option>
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      <input type="hidden" name={`${prefix}_airline`} value={airlineName} />
      {selectedCode === "OTHER" ? <input className="flight-other-airline" required name={`${prefix}_airline_other`} value={otherName} onChange={(event) => setOtherName(event.target.value)} placeholder="Airline or charter name" maxLength={120} /> : null}
    </div>
  );
}

function FlightLegFields({ arrivalDate, defaultDepartureDate, fallbackDestination, fallbackOrigin, leg, onArrivalDateChange, onDepartureDateChange, prefix, title }: FlightLegFieldProps) {
  const isOutbound = prefix === "outbound";
  const icon = isOutbound ? <PlaneTakeoff size={15} /> : <PlaneLanding size={15} />;
  return (
    <fieldset className={`flight-leg-card ${isOutbound ? "is-departure" : "is-arrival"}`}>
      <legend>{icon} {title}</legend>
      <label className="flight-location-field"><MapPin size={12} /> {isOutbound ? "From" : "Return from"}<input name={`${prefix}_origin_location`} required minLength={2} maxLength={180} defaultValue={leg?.origin_location ?? fallbackOrigin ?? ""} placeholder="Brisbane · BNE" /></label>
      <div>
        <label>Departs<input type="date" name={`${prefix}_departure_date`} required value={defaultDepartureDate} onChange={(event) => { onDepartureDateChange(event.target.value); if (arrivalDate < event.target.value) onArrivalDateChange(event.target.value); }} /></label>
        <label>Local time<input type="time" name={`${prefix}_departure_time`} required defaultValue={leg?.departure_time.slice(0, 5) ?? "09:00"} /></label>
      </div>
      <AirlineField defaultCode={leg?.departure_airline_code} defaultName={leg?.departure_airline} prefix={prefix} />
      <label>Flight number <small>Optional</small><input name={`${prefix}_flight_number`} maxLength={40} defaultValue={leg?.departure_flight_number ?? ""} placeholder="QF 501" autoCapitalize="characters" /></label>
      <label>Departure terminal <small>Optional</small><input name={`${prefix}_departure_terminal`} maxLength={80} defaultValue={leg?.departure_terminal ?? ""} placeholder="Domestic · Terminal 3" /></label>
      <label className="flight-location-field"><MapPin size={12} /> {isOutbound ? "To" : "Return to"}<input name={`${prefix}_destination_location`} required minLength={2} maxLength={180} defaultValue={leg?.destination_location ?? fallbackDestination ?? ""} placeholder="Sydney · SYD" /></label>
      <div>
        <label>Arrives<input type="date" name={`${prefix}_arrival_date`} required min={defaultDepartureDate} value={arrivalDate} onChange={(event) => onArrivalDateChange(event.target.value)} /></label>
        <label>Local time<input type="time" name={`${prefix}_arrival_time`} required defaultValue={leg?.arrival_time.slice(0, 5) ?? "11:00"} /></label>
      </div>
      <label>Arrival terminal <small>Optional</small><input name={`${prefix}_arrival_terminal`} maxLength={80} defaultValue={leg?.arrival_terminal ?? ""} placeholder="Domestic · Terminal 3" /></label>
      <div className="flight-leg-passenger-fields">
        <label>Class <small>Optional</small><input name={`${prefix}_travel_class`} maxLength={80} defaultValue={leg?.travel_class ?? ""} placeholder="Economy, Business…" /></label>
        <label>Seat No. <small>Optional</small><input name={`${prefix}_seat_number`} maxLength={40} defaultValue={leg?.seat_number ?? ""} placeholder="14A" autoCapitalize="characters" /></label>
      </div>
    </fieldset>
  );
}

export function FlightEventEditor({ defaultClientId = null, defaultDate, event, flightEvents = [], onClose, onDeleted, onSaved }: FlightEventEditorProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const planLegs = useMemo(() => {
    if (!event) return [];
    const matching = event.travel_plan_id ? flightEvents.filter((item) => item.travel_plan_id === event.travel_plan_id) : [event];
    return [...matching].sort((left, right) => left.leg_order - right.leg_order || left.departure_date.localeCompare(right.departure_date));
  }, [event, flightEvents]);
  const outboundLeg = planLegs.find((leg) => leg.leg_kind === "outbound") ?? planLegs[0] ?? null;
  const returnLeg = planLegs.find((leg) => leg.leg_kind === "return") ?? planLegs[1] ?? null;
  const [hasReturn, setHasReturn] = useState(Boolean(returnLeg));
  const [outboundDepartureDate, setOutboundDepartureDate] = useState(outboundLeg?.departure_date ?? defaultDate);
  const [outboundArrivalDate, setOutboundArrivalDate] = useState(outboundLeg?.arrival_date ?? defaultDate);
  const [returnDepartureDate, setReturnDepartureDate] = useState(returnLeg?.departure_date ?? outboundArrivalDate);
  const [returnArrivalDate, setReturnArrivalDate] = useState(returnLeg?.arrival_date ?? outboundArrivalDate);
  const isExistingPlan = Boolean(event?.travel_plan_id);

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
      const result = event ? await updateFlightPlan(formData) : await createFlightPlan(formData);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The travel plan could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`Delete “${event.title}”${isExistingPlan ? " and every linked flight leg" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      if (event.travel_plan_id) formData.set("plan_id", event.travel_plan_id);
      else formData.set("event_id", event.id);
      const result = await deleteFlightPlan(formData);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onDeleted();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The travel plan could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="calendar-editor-backdrop tablet-editor-backdrop" onClick={handleBackdropClick} role="presentation">
      <form className="calendar-editor calendar-event-editor flight-event-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="flight-event-editor-title">
        <header>
          <div>
            <span><Plane size={13} /> {event ? "Edit flight plan" : "New flight plan"}</span>
            <h2 id="flight-event-editor-title">{event?.title ?? "Plan a trip"}</h2>
            <p>Keep outbound and return flights together while each airport time stays exact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close flight editor" disabled={saving || deleting}><X size={17} /></button>
        </header>

        {event?.travel_plan_id ? <input type="hidden" name="plan_id" value={event.travel_plan_id} /> : null}
        {event && !event.travel_plan_id ? <input type="hidden" name="source_event_id" value={event.id} /> : null}
        <input type="hidden" name="client_id" value={event?.client_id ?? defaultClientId ?? ""} />
        <input type="hidden" name="return_enabled" value={hasReturn ? "true" : "false"} />

        <div className="flight-event-overview">
          <label>Trip title<input name="title" required minLength={2} maxLength={180} defaultValue={event?.title ?? ""} placeholder="e.g. Sydney campaign shoot" autoFocus /></label>
          <label>Trip notes<textarea name="notes" maxLength={4000} defaultValue={outboundLeg?.notes ?? event?.notes ?? ""} placeholder="Booking notes, baggage, contacts or production details…" /></label>
        </div>

        <section className="flight-plan-legs" aria-label="Flight plan legs">
          <div className="flight-plan-legs-heading"><span><Plane size={14} /> Itinerary</span><small>The calendar joins each leg into one continuous trip.</small></div>
          <FlightLegFields prefix="outbound" title="Outbound flight" leg={outboundLeg ?? undefined} defaultDepartureDate={outboundDepartureDate} arrivalDate={outboundArrivalDate} onDepartureDateChange={setOutboundDepartureDate} onArrivalDateChange={setOutboundArrivalDate} />
          {hasReturn ? <>
            <div className="flight-plan-leg-connector" aria-hidden="true"><i /><RotateCcw size={15} /><i /></div>
            <FlightLegFields prefix="return" title="Return flight" leg={returnLeg ?? undefined} fallbackOrigin={outboundLeg?.destination_location} fallbackDestination={outboundLeg?.origin_location} defaultDepartureDate={returnDepartureDate} arrivalDate={returnArrivalDate} onDepartureDateChange={setReturnDepartureDate} onArrivalDateChange={setReturnArrivalDate} />
          </> : null}
          <button type="button" className="flight-return-toggle" onClick={() => {
            setHasReturn((current) => !current);
            if (!hasReturn) {
              setReturnDepartureDate(outboundArrivalDate);
              setReturnArrivalDate(outboundArrivalDate);
            }
          }}>
            {hasReturn ? <><X size={14} /> Remove return flight</> : <><Plus size={14} /> Add return flight</>}
          </button>
        </section>

        <div className="flight-support-grid">
          <fieldset>
            <legend><BedDouble size={14} /> Accommodation <small>Optional</small></legend>
            <label>Title<input name="accommodation_title" maxLength={180} defaultValue={outboundLeg?.accommodation_title ?? event?.accommodation_title ?? ""} placeholder="Hotel or apartment" /></label>
            <label>Location<input name="accommodation_location" maxLength={300} defaultValue={outboundLeg?.accommodation_location ?? event?.accommodation_location ?? ""} placeholder="Address or suburb" /></label>
            <label>Notes<textarea name="accommodation_notes" maxLength={2000} defaultValue={outboundLeg?.accommodation_notes ?? event?.accommodation_notes ?? ""} placeholder="Check-in, confirmation or contact…" /></label>
          </fieldset>
          <fieldset>
            <legend><CarFront size={14} /> Vehicle <small>Optional</small></legend>
            <label>Title<input name="vehicle_title" maxLength={180} defaultValue={outboundLeg?.vehicle_title ?? event?.vehicle_title ?? ""} placeholder="Hire car, transfer or parking" /></label>
            <label>Location<input name="vehicle_location" maxLength={300} defaultValue={outboundLeg?.vehicle_location ?? event?.vehicle_location ?? ""} placeholder="Pickup point or depot" /></label>
            <label>Notes<textarea name="vehicle_notes" maxLength={2000} defaultValue={outboundLeg?.vehicle_notes ?? event?.vehicle_notes ?? ""} placeholder="Pickup time, reference or contact…" /></label>
          </fieldset>
        </div>

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        <footer>
          {event ? <button className="calendar-event-delete" type="button" onClick={() => { void remove(); }} disabled={saving || deleting}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Delete</button> : null}
          <span />
          <button type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || deleting}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> {event ? "Save flight plan" : "Create flight plan"}</>}</button>
        </footer>
      </form>
    </div>
  );
}
