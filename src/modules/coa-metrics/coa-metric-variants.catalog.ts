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
  | "gps"
  /** Uploaded document; value is an R2/S3 storage key stored in client `data`. */
  | "file";

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

const ROUTER_FIELDS: CoaVariantFieldDef[] = [
  {
    key: "category",
    label: "Router category",
    type: "select",
    required: true,
    options: [
      { value: "HBB", label: "HBB — Home Broadband" },
      { value: "OBB", label: "OBB — Office Broadband" },
    ],
  },
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
      "Partner activation for a normal 4G SIM — client name, phone, ID document, signed agreement, and SIM serial from stock.",
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
        key: "nationalIdDocument",
        label: "National ID document",
        type: "file",
        required: true,
        placeholder: "PDF or image of the National ID",
      },
      {
        key: "clientSignedAgreement",
        label: "Client signed agreement",
        type: "file",
        required: true,
        placeholder: "PDF or image of the signed agreement",
      },
      {
        key: "simNumber",
        label: "SIM serial number",
        type: "text",
        required: true,
        mapsTo: "simNumber",
        placeholder: "Enter the SIM serial sold to this customer",
      },
    ],
  },
  {
    metricKey: "internet_subscriptions",
    key: "router",
    label: "Router",
    description:
      "Router activation (HBB or OBB) — customer, router serial, GPS, 4G number, and speed.",
    sortOrder: 20,
    enabled: true,
    fieldSchema: ROUTER_FIELDS,
  },
  // Legacy variants kept disabled so historical entries remain readable.
  {
    metricKey: "internet_subscriptions",
    key: "hbb",
    label: "Home Broadband (HBB)",
    description: "Legacy — use Router.",
    sortOrder: 90,
    enabled: false,
    fieldSchema: ROUTER_FIELDS,
  },
  {
    metricKey: "internet_subscriptions",
    key: "obb",
    label: "Office Broadband (OBB)",
    description: "Legacy — use Router.",
    sortOrder: 91,
    enabled: false,
    fieldSchema: ROUTER_FIELDS,
  },
];
