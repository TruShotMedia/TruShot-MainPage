"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BedDouble, CalendarDays, CarFront, ChevronDown, Clock3, LoaderCircle, MapPin, Plane, PlaneLanding, PlaneTakeoff, RotateCcw, Save, Ticket, Trash2, X } from "lucide-react";
import { createFlightPlan, deleteFlightPlan, updateFlightPlan } from "@/app/admin/flight-actions";
import { AirlineLogo } from "@/components/tablet/airline-logo";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { AIRLINES, findAirline, findClosestAirline } from "@/lib/airlines";
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
  const initialKnown = findAirline(defaultCode) ?? findClosestAirline(defaultName);
  const [selectedCode, setSelectedCode] = useState(initialKnown?.code ?? "");
  const selected = findAirline(selectedCode);

  return (
    <label className="flight-airline-field">
      <span>Airline</span>
      <div className="flight-airline-select-wrap">
        <AirlineLogo code={selected?.code} name={selected?.name ?? "Airline"} />
        <select name={`${prefix}_airline_code`} required value={selectedCode} onChange={(changeEvent) => setSelectedCode(changeEvent.target.value)} aria-label={`${prefix === "outbound" ? "Outbound" : "Return"} airline`}>
          <option value="" disabled>Choose airline</option>
          {AIRLINES.map((airline) => <option key={airline.code} value={airline.code}>{airline.name}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </div>
    </label>
  );
}

function FlightLegFields({ arrivalDate, defaultDepartureDate, fallbackDestination, fallbackOrigin, leg, onArrivalDateChange, onDepartureDateChange, prefix, title }: FlightLegFieldProps) {
  const isOutbound = prefix === "outbound";
  const icon = isOutbound ? <PlaneTakeoff size={15} /> : <PlaneLanding size={15} />;
  const originLabel = isOutbound ? "Departure airport" : "Return departure";
  const destinationLabel = isOutbound ? "Arrival airport" : "Return arrival";

  return (
    <fieldset className={`flight-leg-card ${isOutbound ? "is-outbound" : "is-return"}`}>
      <legend>{icon} {title}</legend>

      <div className="flight-route-fields">
        <label className="flight-location-field">
          <span><MapPin size={13} /> {originLabel}</span>
          <input name={`${prefix}_origin_location`} required minLength={2} maxLength={180} defaultValue={leg?.origin_location ?? fallbackOrigin ?? ""} placeholder="Brisbane · BNE" />
        </label>
        <span className="flight-route-line" aria-hidden="true"><i /><Plane size={15} /><i /></span>
        <label className="flight-location-field">
          <span><MapPin size={13} /> {destinationLabel}</span>
          <input name={`${prefix}_destination_location`} required minLength={2} maxLength={180} defaultValue={leg?.destination_location ?? fallbackDestination ?? ""} placeholder="Sydney · SYD" />
        </label>
      </div>

      <div className="flight-time-grid">
        <label><span><CalendarDays size={13} /> Departs</span><input type="date" name={`${prefix}_departure_date`} required value={defaultDepartureDate} onChange={(changeEvent) => { onDepartureDateChange(changeEvent.target.value); if (arrivalDate < changeEvent.target.value) onArrivalDateChange(changeEvent.target.value); }} /></label>
        <label><span><Clock3 size={13} /> Local time</span><input type="time" name={`${prefix}_departure_time`} required defaultValue={leg?.departure_time.slice(0, 5) ?? "09:00"} /></label>
        <label><span><CalendarDays size={13} /> Arrives</span><input type="date" name={`${prefix}_arrival_date`} required min={defaultDepartureDate} value={arrivalDate} onChange={(changeEvent) => onArrivalDateChange(changeEvent.target.value)} /></label>
        <label><span><Clock3 size={13} /> Local time</span><input type="time" name={`${prefix}_arrival_time`} required defaultValue={leg?.arrival_time.slice(0, 5) ?? "11:00"} /></label>
      </div>

      <div className="flight-carrier-grid">
        <AirlineField defaultCode={leg?.departure_airline_code} defaultName={leg?.departure_airline} prefix={prefix} />
        <label className="flight-number-field"><span><Ticket size={13} /> Flight number <small>Optional</small></span><input name={`${prefix}_flight_number`} maxLength={40} defaultValue={leg?.departure_flight_number ?? ""} placeholder="QF 501" autoCapitalize="characters" /></label>
      </div>

      <details className="flight-leg-details">
        <summary><span>Airport & passenger details</span><small>Terminal, class and seat <ChevronDown size={14} /></small></summary>
        <div className="flight-leg-details-grid">
          <label><span>Departure terminal</span><input name={`${prefix}_departure_terminal`} maxLength={80} defaultValue={leg?.departure_terminal ?? ""} placeholder="Domestic · Terminal 3" /></label>
          <label><span>Arrival terminal</span><input name={`${prefix}_arrival_terminal`} maxLength={80} defaultValue={leg?.arrival_terminal ?? ""} placeholder="Domestic · Terminal 3" /></label>
          <label><span>Class</span><input name={`${prefix}_travel_class`} maxLength={80} defaultValue={leg?.travel_class ?? ""} placeholder="Economy" /></label>
          <label><span>Seat no.</span><input name={`${prefix}_seat_number`} maxLength={40} defaultValue={leg?.seat_number ?? ""} placeholder="14A" autoCapitalize="characters" /></label>
        </div>
      </details>
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

  function enableReturn() {
    setHasReturn(true);
    setReturnDepartureDate(outboundArrivalDate);
    setReturnArrivalDate(outboundArrivalDate);
  }

  return (
      <WorkspaceDialog className="calendar-event-editor flight-event-editor" onSubmit={save} busy={saving || deleting} titleId="flight-event-editor-title" onClose={onClose} header={<>
          <div>
            <span><Plane size={13} /> {event ? "Flight itinerary" : "New flight itinerary"}</span>
            <h2 id="flight-event-editor-title">{event ? "Edit your trip" : "Plan your trip"}</h2>
            <p>Map the route first, then add the travel detail that matters.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close flight editor" disabled={saving || deleting}><X size={17} /></button>
        </>} footer={<>
          {event ? <button className="calendar-event-delete" type="button" onClick={() => { void remove(); }} disabled={saving || deleting}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Delete</button> : null}
          <span />
          <button type="button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || deleting}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> {event ? "Save itinerary" : "Create itinerary"}</>}</button>
        </>}>

        <div className="flight-editor-scroll">
          {event?.travel_plan_id ? <input type="hidden" name="plan_id" value={event.travel_plan_id} /> : null}
          {event && !event.travel_plan_id ? <input type="hidden" name="source_event_id" value={event.id} /> : null}
          <input type="hidden" name="client_id" value={event?.client_id ?? defaultClientId ?? ""} />
          <input type="hidden" name="return_enabled" value={hasReturn ? "true" : "false"} />

          <section className="flight-trip-overview" aria-label="Trip overview">
            <label className="flight-trip-title"><span>Trip title</span><input name="title" required minLength={2} maxLength={180} defaultValue={event?.title ?? ""} placeholder="Sydney campaign shoot" /></label>
            <div className="flight-trip-type" role="group" aria-label="Trip type">
              <span>Journey</span>
              <div>
                <button type="button" className={!hasReturn ? "is-active" : ""} onClick={() => setHasReturn(false)} aria-pressed={!hasReturn}><PlaneTakeoff size={14} /> One way</button>
                <button type="button" className={hasReturn ? "is-active" : ""} onClick={enableReturn} aria-pressed={hasReturn}><RotateCcw size={14} /> Return</button>
              </div>
            </div>
            <label className="flight-trip-notes"><span>Trip notes <small>Optional</small></span><textarea name="notes" maxLength={4000} defaultValue={outboundLeg?.notes ?? event?.notes ?? ""} placeholder="Booking notes, baggage, contacts or production details…" /></label>
          </section>

          <section className="flight-plan-legs" aria-label="Flight plan legs">
            <div className="flight-plan-legs-heading"><span><Plane size={14} /> Flight plan</span><small>All times stay local to each airport.</small></div>
            <FlightLegFields prefix="outbound" title="Outbound" leg={outboundLeg ?? undefined} defaultDepartureDate={outboundDepartureDate} arrivalDate={outboundArrivalDate} onDepartureDateChange={setOutboundDepartureDate} onArrivalDateChange={setOutboundArrivalDate} />
            {hasReturn ? <>
              <div className="flight-plan-leg-connector" aria-hidden="true"><i /><RotateCcw size={15} /><i /></div>
              <FlightLegFields prefix="return" title="Return" leg={returnLeg ?? undefined} fallbackOrigin={outboundLeg?.destination_location} fallbackDestination={outboundLeg?.origin_location} defaultDepartureDate={returnDepartureDate} arrivalDate={returnArrivalDate} onDepartureDateChange={setReturnDepartureDate} onArrivalDateChange={setReturnArrivalDate} />
            </> : null}
          </section>

          <details className="flight-arrangements">
            <summary><span><BedDouble size={14} /> Ground arrangements</span><small>Accommodation and vehicle <ChevronDown size={14} /></small></summary>
            <div className="flight-support-grid">
              <fieldset>
                <legend><BedDouble size={14} /> Accommodation</legend>
                <label>Title<input name="accommodation_title" maxLength={180} defaultValue={outboundLeg?.accommodation_title ?? event?.accommodation_title ?? ""} placeholder="Hotel or apartment" /></label>
                <label>Location<input name="accommodation_location" maxLength={300} defaultValue={outboundLeg?.accommodation_location ?? event?.accommodation_location ?? ""} placeholder="Address or suburb" /></label>
                <label>Notes<textarea name="accommodation_notes" maxLength={2000} defaultValue={outboundLeg?.accommodation_notes ?? event?.accommodation_notes ?? ""} placeholder="Check-in, confirmation or contact…" /></label>
              </fieldset>
              <fieldset>
                <legend><CarFront size={14} /> Vehicle</legend>
                <label>Title<input name="vehicle_title" maxLength={180} defaultValue={outboundLeg?.vehicle_title ?? event?.vehicle_title ?? ""} placeholder="Hire car, transfer or parking" /></label>
                <label>Location<input name="vehicle_location" maxLength={300} defaultValue={outboundLeg?.vehicle_location ?? event?.vehicle_location ?? ""} placeholder="Pickup point or depot" /></label>
                <label>Notes<textarea name="vehicle_notes" maxLength={2000} defaultValue={outboundLeg?.vehicle_notes ?? event?.vehicle_notes ?? ""} placeholder="Pickup time, reference or contact…" /></label>
              </fieldset>
            </div>
          </details>

          {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        </div>

      </WorkspaceDialog>
  );
}
