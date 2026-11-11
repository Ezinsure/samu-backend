/**
 * Field schema for metric logging variants.
 * `mapsTo` writes into a legacy CoaEvidenceClient column; otherwise values live in `data`.
 */
export type CoaVariantFieldType =
  | "text"
  | "phone"
  | "nid"
  | "date"
  | "select"
  | "gps";

export type CoaVariantFieldMapsTo =
  | "fullName"
  | "phone"
  | "email"
  | "nidNumber"
  | "accountRef"
  | "simNumber";

export type CoaVariantFieldDef = {
  key: string;
  label: string;
  type: CoaVariantFieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  mapsTo?: CoaVariantFieldMapsTo;
  /** Prefill from the signed-in user. */
  defaultFrom?: "actorName" | "actorDistrict";
  placeholder?: string;
};

export type CoaMetricVariantSeed = {
  metricKey: string;
  key: string;
  label: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  fieldSchema: CoaVariantFieldDef[];
};

const BROADBAND_FIELDS: CoaVariantFieldDef[] = [
  {
    key: "registrationDate",
    label: "Date of registration",
    type: "date",
    required: true,
  },
  {
    key: "customerName",
    label: "Customer name",
    type: "text",
    required: true,
    mapsTo: "fullName",
    placeholder: "Full name",
  },
  {
    key: "routerSerial",
    label: "Router serial number",
    type: "text",
    required: true,
    placeholder: "Serial on the device",
  },
  {
    key: "gps",
    label: "GPS location",
    type: "gps",
    required: true,
  },
  {
    key: "fourGNumber",
    label: "4G number",
    type: "text",
    required: true,
    mapsTo: "simNumber",
    placeholder: "4G / SIM number",
  },
  {
    key: "phone",
    label: "Phone number",
    type: "phone",
    required: true,
    mapsTo: "phone",
  },
  {
    key: "agentName",
    label: "Agent name",
    type: "text",
    required: true,
    defaultFrom: "actorName",
    placeholder: "Amazina yose",
  },
  {
    key: "district",
    label: "District",
    type: "text",
    required: true,
    defaultFrom: "actorDistrict",
  },
  {
    key: "speed",
    label: "Product speed",
    type: "select",
    required: true,
    options: [
      { value: "20Mbps", label: "20 Mbps" },
      { value: "50Mbps", label: "50 Mbps" },
    ],
  },
];

/** Seeded variants. Only metrics listed here get a chooser; others keep a single form. */
export const COA_METRIC_VARIANT_CATALOG: CoaMetricVariantSeed[] = [
  {
    metricKey: "internet_subscriptions",
    key: "sim",
    label: "Mobile SIM internet",
    description:
      "Partner activation for a normal 4G SIM — client name, phone, NID, and SIM number.",
    sortOrder: 10,
    enabled: true,
    fieldSchema: [
      {
        key: "fullName",
        label: "Customer name",
        type: "text",
        required: true,
        mapsTo: "fullName",
      },
      {
        key: "phone",
        label: "Phone number",
        type: "phone",
        required: true,
        mapsTo: "phone",
      },
      {
        key: "nidNumber",
        label: "National ID",
        type: "nid",
        required: true,
        mapsTo: "nidNumber",
      },
      {
        key: "simNumber",
        label: "4G SIM number",
        type: "text",
        required: true,
        mapsTo: "simNumber",
      },
    ],
  },
  {
    metricKey: "internet_subscriptions",
    key: "hbb",
    label: "Home Broadband (HBB)",
    description:
      "Home Broadband router activation — customer, router serial, GPS, 4G number, and speed.",
    sortOrder: 20,
    enabled: true,
    fieldSchema: BROADBAND_FIELDS,
  },
  {
    metricKey: "internet_subscriptions",
    key: "obb",
    label: "Office Broadband (OBB)",
    description:
      "Office Broadband router activation — customer, router serial, GPS, 4G number, and speed.",
    sortOrder: 30,
    enabled: true,
    fieldSchema: BROADBAND_FIELDS,
  },
];
