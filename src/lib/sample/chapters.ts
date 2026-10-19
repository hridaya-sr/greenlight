// Demo data for a fictional organization, "Iota Phi Sigma".
//
// This one file drives the seed, the sample IRS fixture files (in the real
// IRS formats), the sample chapter CSV/XLSX, and the sample PDFs. EINs use the
// 89- prefix, which the IRS does not assign, so they never collide with real
// organizations if real IRS data is loaded later.

export const SAMPLE_ORG_NAME = "Iota Phi Sigma";
export const SAMPLE_NAME_PATTERN = "{Org Name} – {Chapter Name} Chapter";

export type IrsScenario =
  | "clean"
  | "revoked" // on the Automatic Revocation list, not reinstated
  | "reinstated" // revoked once, later reinstated — should NOT flag
  | "no_filing" // last 990-N is several years old
  | "name" // IRS legal name doesn't follow HQ naming format
  | "fiscal_year" // fiscal year not Jan–Dec
  | "name_and_fy"
  | "not_in_bmf"; // EIN not found anywhere in IRS data

export type SampleChapter = {
  name: string;
  ein: string;
  region: string;
  district: string;
  school: string;
  city: string;
  state: string;
  zip: string;
  treasurer: string;
  scenario: IrsScenario;
  irsName?: string; // override for "name" scenarios
  acctPd?: string; // fiscal year end month for FY scenarios
  // Seed with documents already submitted and extracted
  submitted: boolean;
  // EIN printed on the submitted determination letter, if it differs
  documentEin?: string;
  endingBalance: number;
};

const c = (x: SampleChapter) => x;

export const SAMPLE_CHAPTERS: SampleChapter[] = [
  c({ name: "Alpha", ein: "891043217", region: "Northeast", district: "District 1", school: "Lakeshore University", city: "Burlington", state: "VT", zip: "05405", treasurer: "Maya Chen", scenario: "clean", submitted: true, endingBalance: 18432.17 }),
  c({ name: "Beta", ein: "891052864", region: "Northeast", district: "District 1", school: "Hartwell College", city: "Hartford", state: "CT", zip: "06106", treasurer: "Jordan Ellis", scenario: "clean", submitted: true, endingBalance: 9210.55 }),
  c({ name: "Gamma", ein: "891067390", region: "Northeast", district: "District 2", school: "Keystone State University", city: "State College", state: "PA", zip: "16801", treasurer: "Priya Raman", scenario: "fiscal_year", acctPd: "06", submitted: true, endingBalance: 27118.4 }),
  c({ name: "Delta", ein: "891071145", region: "Northeast", district: "District 2", school: "Hudson Valley University", city: "Poughkeepsie", state: "NY", zip: "12601", treasurer: "Sam Okafor", scenario: "revoked", submitted: false, endingBalance: 3105.0 }),
  c({ name: "Epsilon", ein: "891089023", region: "Southeast", district: "District 3", school: "Piedmont University", city: "Chapel Hill", state: "NC", zip: "27514", treasurer: "Avery Brooks", scenario: "clean", submitted: false, endingBalance: 14250.0 }),
  c({ name: "Zeta", ein: "891093658", region: "Southeast", district: "District 3", school: "Tidewater College", city: "Norfolk", state: "VA", zip: "23529", treasurer: "Elena Vasquez", scenario: "name", irsName: "ZETA CHAPTER OF IOTA PHI SIGMA", submitted: true, endingBalance: 11876.32 }),
  c({ name: "Eta", ein: "891104472", region: "Southeast", district: "District 4", school: "Gulf Coast University", city: "Mobile", state: "AL", zip: "36688", treasurer: "Marcus Hill", scenario: "no_filing", submitted: true, endingBalance: 2240.81 }),
  c({ name: "Theta", ein: "891118806", region: "Southeast", district: "District 4", school: "Savannah River College", city: "Augusta", state: "GA", zip: "30912", treasurer: "Grace Kim", scenario: "clean", submitted: true, endingBalance: 22904.66 }),
  c({ name: "Iota", ein: "891125539", region: "Midwest", district: "District 5", school: "Prairie State University", city: "Champaign", state: "IL", zip: "61820", treasurer: "Noah Fischer", scenario: "clean", submitted: true, documentEin: "891125593", endingBalance: 7810.09 }),
  c({ name: "Kappa", ein: "891136281", region: "Midwest", district: "District 5", school: "Great Lakes University", city: "Ann Arbor", state: "MI", zip: "48109", treasurer: "Olivia Martin", scenario: "clean", submitted: false, endingBalance: 16422.38 }),
  c({ name: "Lambda", ein: "891147710", region: "Midwest", district: "District 6", school: "Heartland College", city: "Lawrence", state: "KS", zip: "66045", treasurer: "Ethan Novak", scenario: "revoked", submitted: true, endingBalance: 4517.25 }),
  c({ name: "Mu", ein: "891152947", region: "Midwest", district: "District 6", school: "North Woods University", city: "Duluth", state: "MN", zip: "55812", treasurer: "Hannah Lee", scenario: "fiscal_year", acctPd: "05", submitted: false, endingBalance: 8890.0 }),
  c({ name: "Nu", ein: "891163384", region: "West", district: "District 7", school: "Cascade University", city: "Eugene", state: "OR", zip: "97403", treasurer: "Diego Ramirez", scenario: "clean", submitted: true, endingBalance: 31277.9 }),
  c({ name: "Xi", ein: "891170628", region: "West", district: "District 7", school: "Sierra State University", city: "Reno", state: "NV", zip: "89557", treasurer: "Chloe Nguyen", scenario: "name", irsName: "IOTA PHI SIGMA FRATERNITY INC", submitted: false, endingBalance: 5402.12 }),
  c({ name: "Omicron", ein: "891186053", region: "West", district: "District 8", school: "Desert Mesa University", city: "Tempe", state: "AZ", zip: "85281", treasurer: "Isaac Goldberg", scenario: "no_filing", submitted: false, endingBalance: 990.43 }),
  c({ name: "Pi", ein: "891191476", region: "West", district: "District 8", school: "Pacific Crest College", city: "San Luis Obispo", state: "CA", zip: "93407", treasurer: "Zoe Patel", scenario: "clean", submitted: true, endingBalance: 12655.0 }),
  c({ name: "Rho", ein: "891203819", region: "Northeast", district: "District 1", school: "Granite State University", city: "Durham", state: "NH", zip: "03824", treasurer: "Liam O'Connor", scenario: "name_and_fy", irsName: "IPS RHO CHAPTER", acctPd: "08", submitted: true, endingBalance: 6733.58 }),
  c({ name: "Sigma", ein: "891214265", region: "Northeast", district: "District 2", school: "Chesapeake University", city: "College Park", state: "MD", zip: "20742", treasurer: "Ava Thompson", scenario: "clean", submitted: false, documentEin: "891214625", endingBalance: 10120.0 }),
  c({ name: "Tau", ein: "891225790", region: "Southeast", district: "District 3", school: "Blue Ridge College", city: "Charlottesville", state: "VA", zip: "22904", treasurer: "Benjamin Wright", scenario: "clean", submitted: true, endingBalance: 19544.71 }),
  c({ name: "Upsilon", ein: "891238102", region: "Southeast", district: "District 4", school: "Magnolia State University", city: "Oxford", state: "MS", zip: "38677", treasurer: "Sofia Rossi", scenario: "not_in_bmf", submitted: false, endingBalance: 1500.0 }),
  c({ name: "Phi", ein: "891241637", region: "Midwest", district: "District 5", school: "Buckeye Valley University", city: "Athens", state: "OH", zip: "45701", treasurer: "Caleb Johnson", scenario: "clean", submitted: true, endingBalance: 14002.2 }),
  c({ name: "Chi", ein: "891256984", region: "Midwest", district: "District 6", school: "Missouri River College", city: "Columbia", state: "MO", zip: "65211", treasurer: "Lily Anderson", scenario: "reinstated", submitted: false, endingBalance: 4410.0 }),
  c({ name: "Psi", ein: "891262318", region: "West", district: "District 7", school: "Evergreen State College", city: "Bellingham", state: "WA", zip: "98225", treasurer: "Ryan Murphy", scenario: "clean", submitted: true, documentEin: "891262381", endingBalance: 8875.44 }),
  c({ name: "Omega", ein: "891279045", region: "West", district: "District 8", school: "Rocky Mountain University", city: "Boulder", state: "CO", zip: "80309", treasurer: "Emma Davis", scenario: "clean", submitted: false, endingBalance: 20310.0 }),
  c({ name: "Alpha Beta", ein: "891283572", region: "Northeast", district: "District 1", school: "Bay State College", city: "Amherst", state: "MA", zip: "01003", treasurer: "Nathan Park", scenario: "no_filing", submitted: false, endingBalance: 2875.0 }),
];

export function treasurerEmail(ch: SampleChapter) {
  const slug = ch.name.toLowerCase().replace(/\s+/g, "");
  return `treasurer.${slug}@ips-chapters.example`;
}

/** The name the IRS has on file (uppercase, no punctuation — like the real BMF). */
export function irsLegalName(ch: SampleChapter) {
  return ch.irsName ?? `${SAMPLE_ORG_NAME} ${ch.name} Chapter`.toUpperCase();
}

/** Chapters that ship with sample PDFs for a live upload demo (not seeded as submitted). */
export const LIVE_DEMO_CHAPTERS = ["Kappa", "Sigma"];
