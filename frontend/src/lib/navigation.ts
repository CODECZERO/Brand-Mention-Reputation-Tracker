import { LayoutDashboard, LineChart, MessageSquareText, PlusCircle } from "lucide-react";

export const appNavItems = [
  {
    label: "Brands",
    to: "/brands",
    icon: LayoutDashboard,
  },
  {
    label: "Create Brand",
    to: "/brands/create",
    icon: PlusCircle,
  },
];

export const brandNavItems = (brandId: string) => [
  {
    label: "Dashboard",
    to: `/brands/${brandId}/dashboard`,
    icon: LayoutDashboard,
  },
  {
    label: "Live Mentions",
    to: `/brands/${brandId}/live`,
    icon: MessageSquareText,
  },
  {
    label: "Analytics",
    to: `/brands/${brandId}/analytics`,
    icon: LineChart,
  },
];
