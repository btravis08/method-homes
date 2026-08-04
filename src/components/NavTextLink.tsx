import { SmartLink } from "@/components/SmartLink";

/*
  The nav link style, shared by the header, meganav, footer, and
  breadcrumbs: label type with the underline that draws in from the
  left on hover and exits right. `active` keeps the underline drawn
  (open menu item, current breadcrumb).
*/
export function NavTextLink({
  label,
  href = "#",
  active = false,
  className = "",
}: {
  label: string;
  href?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <SmartLink href={href} className={`label group relative text-ink ${className}`}>
      {label}
      <span
        className={`absolute inset-x-0 -bottom-0.5 h-px origin-right bg-ink transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100 ${
          active ? "origin-left scale-x-100" : "scale-x-0"
        }`}
      />
    </SmartLink>
  );
}
