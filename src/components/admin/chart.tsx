"use client";

import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function AdminChart({ option, height = 290 }: { option: Record<string, unknown>; height?: number }) {
  return <ReactECharts option={option} style={{ height, width: "100%" }} opts={{ renderer: "svg" }} />;
}
