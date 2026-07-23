"use client";

import { Activity } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CapsuleCard } from "@/components/capsule/card";
import { SlideTitle } from "@/components/capsule/slide-title";
import { StatePanel } from "@/components/state-panel";
import { formatDate, formatNumber } from "@/lib/format";

export type ActivityPoint = {
  date: string;
  count: number;
};

type ActivityViewProps = {
  points: ActivityPoint[];
  loading: boolean;
  error: string | null;
};

export function ActivityView({
  points,
  loading,
  error,
}: ActivityViewProps) {
  if (error) {
    return (
      <StatePanel
        kind="error"
        title="Activity could not be loaded"
        description={error}
      />
    );
  }
  if (loading) {
    return (
      <StatePanel
        kind="loading"
        title="Charting activity"
        description="Aggregating events from the local archive."
      />
    );
  }
  if (points.length === 0) {
    return (
      <StatePanel
        icon={Activity}
        title="No activity events found"
        description="This archive did not contain follower, comment, call, or other supported events."
      />
    );
  }

  const total = points.reduce((sum, point) => sum + point.count, 0);
  const chartData = points.map((point) => ({
    ...point,
    label: formatDate(`${point.date}T00:00:00`),
  }));
  const peak = Math.max(...points.map((point) => point.count), 1);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="meta-caps">Timeline</p>
          <SlideTitle accent="slate" className="mt-1">
            Account activity
          </SlideTitle>
        </div>
        <p className="font-body text-sm text-body">
          {formatNumber(total)} events across {formatNumber(points.length)}{" "}
          active days
        </p>
      </div>

      <CapsuleCard className="h-80 p-4 sm:p-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid
              vertical={false}
              stroke="var(--ink)"
              strokeOpacity={0.12}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--body)", fontSize: 10, fontFamily: "Lora" }}
              axisLine={{ stroke: "var(--ink)" }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis hide domain={[0, peak]} />
            <Tooltip
              formatter={(value) => [formatNumber(Number(value)), "Events"]}
              contentStyle={{
                background: "var(--cream)",
                border: "2px solid var(--ink)",
                borderRadius: "6px",
                fontFamily: "Courier Prime, monospace",
              }}
            />
            <Bar
              dataKey="count"
              fill="var(--teal)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </CapsuleCard>
    </section>
  );
}
