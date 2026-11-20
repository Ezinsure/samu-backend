import type { StockAttributesSchema } from "./stock-attributes.js";

/** Default serialised device types seeded for internet + device stock. */
export type StockItemTypeSeed = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  /** Optional per-unit attribute schema (brand/model, etc.). */
  attributesSchema?: StockAttributesSchema;
};

const SMARTPHONE_ATTRIBUTES: StockAttributesSchema = {
  fields: [
    {
      key: "brand",
      label: "Brand",
      type: "text",
      required: true,
      placeholder: "e.g. Samsung, Tecno, Apple",
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      required: true,
      placeholder: "e.g. Galaxy A17, Spark 20",
    },
  ],
};

export const STOCK_ITEM_TYPE_CATALOG: StockItemTypeSeed[] = [
  {
    key: "sim_4g",
    label: "4G SIM",
    description: "Mobile / partner 4G SIM cards used for internet activations.",
    sortOrder: 10,
    enabled: true,
  },
  {
    key: "router_hbb",
    label: "Home Broadband router (HBB)",
    description: "Routers issued for Home Broadband customer activations.",
    sortOrder: 20,
    enabled: true,
  },
  {
    key: "router_obb",
    label: "Office Broadband router (OBB)",
    description: "Routers issued for Office Broadband customer activations.",
    sortOrder: 30,
    enabled: true,
  },
  {
    key: "smartphone",
    label: "Smartphone",
    description:
      "Handsets tracked by brand and model through intake, assignment, sale, and returns.",
    sortOrder: 40,
    enabled: true,
    attributesSchema: SMARTPHONE_ATTRIBUTES,
  },
];
