/* eslint-disable @next/next/no-img-element */
import type { Company } from "@/lib/types";

export function CompanyLogo({ company, className = "" }: { company: Company | undefined; className?: string }) {
  if (!company) return null;
  if (!company.logo) return <span className={className}>{company.code}</span>;
  return <img src={company.logo} alt={company.name} className={`object-contain ${className}`} />;
}
