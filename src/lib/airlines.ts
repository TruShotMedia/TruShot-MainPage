export type Airline = {
  code: string;
  name: string;
};

// IATA carrier codes power the airline marks in the calendar. The list covers
// the scheduled airlines most commonly encountered across Australia and
// international production travel.
export const AIRLINES: Airline[] = [
  { code: "AA", name: "American Airlines" },
  { code: "AC", name: "Air Canada" },
  { code: "AF", name: "Air France" },
  { code: "AI", name: "Air India" },
  { code: "AK", name: "AirAsia" },
  { code: "AM", name: "Aeroméxico" },
  { code: "AR", name: "Aerolíneas Argentinas" },
  { code: "AS", name: "Alaska Airlines" },
  { code: "AT", name: "Royal Air Maroc" },
  { code: "AV", name: "Avianca" },
  { code: "AY", name: "Finnair" },
  { code: "AZ", name: "ITA Airways" },
  { code: "B6", name: "JetBlue" },
  { code: "BA", name: "British Airways" },
  { code: "BI", name: "Royal Brunei Airlines" },
  { code: "BR", name: "EVA Air" },
  { code: "CA", name: "Air China" },
  { code: "CI", name: "China Airlines" },
  { code: "CM", name: "Copa Airlines" },
  { code: "CX", name: "Cathay Pacific" },
  { code: "CZ", name: "China Southern" },
  { code: "D7", name: "AirAsia X" },
  { code: "DL", name: "Delta Air Lines" },
  { code: "DT", name: "TAAG Angola Airlines" },
  { code: "DY", name: "Norwegian" },
  { code: "EI", name: "Aer Lingus" },
  { code: "EK", name: "Emirates" },
  { code: "ET", name: "Ethiopian Airlines" },
  { code: "EY", name: "Etihad Airways" },
  { code: "FJ", name: "Fiji Airways" },
  { code: "FR", name: "Ryanair" },
  { code: "GA", name: "Garuda Indonesia" },
  { code: "GF", name: "Gulf Air" },
  { code: "G3", name: "GOL Linhas Aéreas" },
  { code: "HA", name: "Hawaiian Airlines" },
  { code: "HO", name: "Juneyao Air" },
  { code: "HX", name: "Hong Kong Airlines" },
  { code: "IB", name: "Iberia" },
  { code: "J2", name: "Azerbaijan Airlines" },
  { code: "J9", name: "Jazeera Airways" },
  { code: "JL", name: "Japan Airlines" },
  { code: "JQ", name: "Jetstar Airways" },
  { code: "K6", name: "Cambodia Angkor Air" },
  { code: "KE", name: "Korean Air" },
  { code: "KL", name: "KLM Royal Dutch Airlines" },
  { code: "KQ", name: "Kenya Airways" },
  { code: "KU", name: "Kuwait Airways" },
  { code: "LA", name: "LATAM Airlines" },
  { code: "LH", name: "Lufthansa" },
  { code: "LO", name: "LOT Polish Airlines" },
  { code: "LX", name: "Swiss International Air Lines" },
  { code: "LY", name: "EL AL" },
  { code: "MH", name: "Malaysia Airlines" },
  { code: "MS", name: "Egyptair" },
  { code: "MU", name: "China Eastern" },
  { code: "NH", name: "All Nippon Airways" },
  { code: "NK", name: "Spirit Airlines" },
  { code: "NZ", name: "Air New Zealand" },
  { code: "OD", name: "Batik Air Malaysia" },
  { code: "OK", name: "Czech Airlines" },
  { code: "OS", name: "Austrian Airlines" },
  { code: "OZ", name: "Asiana Airlines" },
  { code: "PC", name: "Pegasus Airlines" },
  { code: "PR", name: "Philippine Airlines" },
  { code: "PS", name: "Ukraine International Airlines" },
  { code: "QF", name: "Qantas" },
  { code: "QR", name: "Qatar Airways" },
  { code: "QZ", name: "Indonesia AirAsia" },
  { code: "RJ", name: "Royal Jordanian" },
  { code: "SA", name: "South African Airways" },
  { code: "SK", name: "Scandinavian Airlines" },
  { code: "SQ", name: "Singapore Airlines" },
  { code: "SV", name: "Saudia" },
  { code: "TG", name: "Thai Airways" },
  { code: "TK", name: "Turkish Airlines" },
  { code: "TP", name: "TAP Air Portugal" },
  { code: "TR", name: "Scoot" },
  { code: "UA", name: "United Airlines" },
  { code: "UL", name: "SriLankan Airlines" },
  { code: "UX", name: "Air Europa" },
  { code: "U2", name: "easyJet" },
  { code: "VA", name: "Virgin Australia" },
  { code: "VN", name: "Vietnam Airlines" },
  { code: "VS", name: "Virgin Atlantic" },
  { code: "VJ", name: "VietJet Air" },
  { code: "W6", name: "Wizz Air" },
  { code: "WS", name: "WestJet" },
  { code: "WY", name: "Oman Air" },
  { code: "XQ", name: "SunExpress" },
  { code: "ZL", name: "Rex Airlines" },
].sort((left, right) => left.name.localeCompare(right.name));

export function findAirline(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase();
  return normalized ? AIRLINES.find((airline) => airline.code === normalized) ?? null : null;
}

const AIRLINE_ALIASES: Record<string, string> = {
  "air nz": "NZ",
  "american": "AA",
  "british": "BA",
  "cathay": "CX",
  "delta": "DL",
  "emirates airline": "EK",
  "jetstar": "JQ",
  "klm": "KL",
  "qantas airways": "QF",
  "qantas airlines": "QF",
  "rex": "ZL",
  "regional express": "ZL",
  "singapore": "SQ",
  "thai": "TG",
  "virgin": "VA",
  "virgin au": "VA",
  "virgin aus": "VA",
  "virgin australia airlines": "VA",
};

function normaliseAirlineName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(airlines?|airways?|international|limited|ltd|company|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

/**
 * Resolves historic free-text airline names to a stable airline from the
 * selector. Aliases cover common abbreviations; the conservative token match
 * keeps unrelated names from silently becoming a different carrier.
 */
export function findClosestAirline(name: string | null | undefined) {
  const raw = name?.trim();
  if (!raw) return null;
  const normalized = normaliseAirlineName(raw);
  if (!normalized) return null;

  const alias = AIRLINE_ALIASES[normalized];
  if (alias) return findAirline(alias);

  let closest: Airline | null = null;
  let closestScore = 0;
  for (const airline of AIRLINES) {
    const score = tokenSimilarity(normalized, normaliseAirlineName(airline.name));
    if (score > closestScore) {
      closest = airline;
      closestScore = score;
    }
  }
  return closestScore >= 0.7 ? closest : null;
}

export function findAirlineCodeByName(name: string | null | undefined) {
  return findClosestAirline(name)?.code ?? null;
}

export function airlineLogoUrl(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{2,3}$/.test(normalized)
    ? `https://images.kiwi.com/airlines/64/${normalized}.png`
    : null;
}
