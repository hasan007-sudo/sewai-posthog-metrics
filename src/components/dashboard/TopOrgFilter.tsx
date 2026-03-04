"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface TopOrgFilterProps {
  orgOptions: string[];
  selectedOrg: string | null;
}

export function TopOrgFilter({ orgOptions, selectedOrg }: TopOrgFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectValue = selectedOrg ?? "all";

  const optionValues = useMemo(
    () => Array.from(new Set(orgOptions.map((value) => value.trim()))),
    [orgOptions],
  );

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="top-org-filter"
        className="text-sm font-medium text-muted-foreground whitespace-nowrap"
      >
        Organization
      </label>
      <select
        id="top-org-filter"
        value={selectValue}
        disabled={isPending}
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextParams = new URLSearchParams(searchParams.toString());

          if (nextValue === "all") {
            nextParams.delete("org");
          } else {
            nextParams.set("org", nextValue);
          }

          const nextQuery = nextParams.toString();
          const nextUrl = nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname;

          startTransition(() => {
            router.replace(nextUrl, { scroll: false });
          });
        }}
        className="rounded-md border bg-background px-3 py-2 text-sm min-w-40"
      >
        <option value="all">All orgs</option>
        {optionValues.map((orgName) => (
          <option key={orgName} value={orgName}>
            {orgName}
          </option>
        ))}
      </select>
    </div>
  );
}
