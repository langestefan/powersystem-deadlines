import type { Region } from './taxonomy';

/**
 * Country -> region, so an edition only has to state its country. When a country
 * is missing here, scripts/validate.ts asks the contributor to set `region:`
 * explicitly rather than guessing.
 */
const COUNTRY_REGIONS: Record<string, Region> = {
  // Europe
  Austria: 'Europe',
  Belgium: 'Europe',
  Bulgaria: 'Europe',
  Croatia: 'Europe',
  Cyprus: 'Europe',
  Czechia: 'Europe',
  'Czech Republic': 'Europe',
  Denmark: 'Europe',
  Estonia: 'Europe',
  Finland: 'Europe',
  France: 'Europe',
  Germany: 'Europe',
  Greece: 'Europe',
  Hungary: 'Europe',
  Iceland: 'Europe',
  Ireland: 'Europe',
  Italy: 'Europe',
  Latvia: 'Europe',
  Lithuania: 'Europe',
  Luxembourg: 'Europe',
  Malta: 'Europe',
  Netherlands: 'Europe',
  Norway: 'Europe',
  Poland: 'Europe',
  Portugal: 'Europe',
  Romania: 'Europe',
  Serbia: 'Europe',
  Slovakia: 'Europe',
  Slovenia: 'Europe',
  Spain: 'Europe',
  Sweden: 'Europe',
  Switzerland: 'Europe',
  Turkey: 'Europe',
  Ukraine: 'Europe',
  'United Kingdom': 'Europe',

  // North America
  Canada: 'North America',
  Mexico: 'North America',
  USA: 'North America',
  'United States': 'North America',

  // Latin America
  Argentina: 'Latin America',
  Brazil: 'Latin America',
  Chile: 'Latin America',
  Colombia: 'Latin America',
  Ecuador: 'Latin America',
  Peru: 'Latin America',
  Uruguay: 'Latin America',

  // Asia
  China: 'Asia',
  India: 'Asia',
  Indonesia: 'Asia',
  Israel: 'Asia',
  Japan: 'Asia',
  Jordan: 'Asia',
  Malaysia: 'Asia',
  Philippines: 'Asia',
  Qatar: 'Asia',
  Singapore: 'Asia',
  'South Korea': 'Asia',
  Taiwan: 'Asia',
  Thailand: 'Asia',
  'United Arab Emirates': 'Asia',
  Vietnam: 'Asia',

  // Africa
  Egypt: 'Africa',
  Kenya: 'Africa',
  Morocco: 'Africa',
  Nigeria: 'Africa',
  'South Africa': 'Africa',
  Tunisia: 'Africa',

  // Oceania
  Australia: 'Oceania',
  'New Zealand': 'Oceania',
};

export function regionForCountry(country: string | undefined): Region | undefined {
  if (!country) return undefined;
  return COUNTRY_REGIONS[country.trim()];
}

export function knownCountries(): string[] {
  return Object.keys(COUNTRY_REGIONS).sort();
}
