/** Default serialised device types seeded for internet stock. */
export type StockItemTypeSeed = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
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
];
