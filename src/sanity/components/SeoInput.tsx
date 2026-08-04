import { Badge, Box, Card, Flex, Stack, Text } from "@sanity/ui";
import { useFormValue, type ObjectInputProps } from "sanity";

import designops from "../../../designops.config.json";

/*
  Yoast-style live preview under the SEO fields: a Google-result
  mockup and character counters that read the document's own
  title/slug as fallbacks, so editors see exactly what ships before
  they override anything.
*/

const LIMITS = { title: 60, description: 160 };

/* route prefix per document type, for the previewed URL */
const PATH_PREFIX: Record<string, string> = {
  product: "/products/",
  collection: "/collections/",
  post: "/journal/",
  page: "/",
};

function Counter({ label, length, limit }: { label: string; length: number; limit: number }) {
  const over = length > limit;
  return (
    <Flex align="center" gap={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Badge tone={over ? "critical" : length > 0 ? "positive" : "default"}>
        {length} / {limit}
      </Badge>
    </Flex>
  );
}

export function SeoInput(props: ObjectInputProps) {
  const docTitle = useFormValue(["title"]) as string | undefined;
  const docType = useFormValue(["_type"]) as string | undefined;
  const slug = (useFormValue(["slug"]) as { current?: string } | undefined)?.current;

  const value = (props.value ?? {}) as {
    title?: string;
    description?: string;
    canonical?: string;
    noindex?: boolean;
  };
  const title = value.title || docTitle || "Untitled";
  const description =
    value.description ||
    "No meta description yet — search engines will pick their own snippet from the page.";
  const url =
    value.canonical ||
    `${designops.site.baseUrl}${PATH_PREFIX[docType ?? "page"] ?? "/"}${slug === "home" ? "" : (slug ?? "")}`;

  return (
    <Stack space={4}>
      {props.renderDefault(props)}
      <Card padding={4} radius={2} border>
        <Stack space={4}>
          <Flex gap={4} wrap="wrap">
            <Counter label="Title" length={(value.title || docTitle || "").length} limit={LIMITS.title} />
            <Counter label="Description" length={(value.description ?? "").length} limit={LIMITS.description} />
            {value.noindex && <Badge tone="caution">noindex — hidden from search</Badge>}
          </Flex>
          <Box>
            <Stack space={2}>
              <Text size={1} style={{ color: "#202124" }} muted>
                {url}
              </Text>
              <Text size={2} style={{ color: "#1a0dab", fontWeight: 500 }}>
                {title.length > LIMITS.title ? `${title.slice(0, LIMITS.title)}…` : title}
              </Text>
              <Text size={1} muted>
                {description.length > LIMITS.description
                  ? `${description.slice(0, LIMITS.description)}…`
                  : description}
              </Text>
            </Stack>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
}
