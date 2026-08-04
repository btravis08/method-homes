import Link from "next/link";

/*
  Internal hrefs ride next/link so navigation stays client-side (the
  chrome never remounts and the page content can transition); hashes,
  external URLs, and placeholder "#" links stay plain anchors.

  prefetch: full-route prefetch on viewport entry, so the fade starts
  the instant a link is tapped instead of waiting on the server.
  scroll={false}: PageTransition resets scroll itself between the
  fade-out and fade-in, so the exiting page never visibly jumps.
*/
export function SmartLink({
  href = "#",
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & { href?: string }) {
  if (href.startsWith("/"))
    return <Link href={href} prefetch={true} scroll={false} {...props} />;
  return <a href={href} {...props} />;
}
