import { SettingsPageClient } from "./settings-page-client";

interface SettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const from = resolvedSearchParams?.from;

  return (
    <SettingsPageClient
      from={typeof from === "string" ? from : undefined}
    />
  );
}
