import type { Feature, FeatureCollection } from "geojson";

/**
 * Apply a Felt filter expression to a FeatureCollection,
 * returning only the features that match.
 */

type FilterExpression = unknown[] | null | undefined;

function matchesFilter(feature: Feature, filter: unknown[]): boolean {
  // Compound filter: [filter, "and"/"or", filter]
  if (Array.isArray(filter[0])) {
    const [left, op, right] = filter;
    const leftMatch = matchesFilter(feature, left as unknown[]);
    const rightMatch = matchesFilter(feature, right as unknown[]);
    if (op === "and") return leftMatch && rightMatch;
    if (op === "or") return leftMatch || rightMatch;
    return true;
  }

  // Simple filter: [attribute, operator, value]
  const [attr, op, value] = filter;
  const propVal = feature.properties?.[attr as string];

  switch (op) {
    case "eq":
      return propVal === value;
    case "ne":
      return propVal !== value;
    case "gt":
      return propVal > (value as number);
    case "lt":
      return propVal < (value as number);
    case "ge":
      return propVal >= (value as number);
    case "le":
      return propVal <= (value as number);
    case "cn":
      return typeof propVal === "string" && propVal.includes(String(value));
    case "nc":
      return typeof propVal === "string" && !propVal.includes(String(value));
    case "in":
      return Array.isArray(value) && value.includes(propVal);
    case "ni":
      return Array.isArray(value) && !value.includes(propVal);
    default:
      return true;
  }
}

export function applyFilter(
  fc: FeatureCollection,
  filter: FilterExpression,
): FeatureCollection {
  if (!filter || filter.length === 0) return fc;
  const features = fc.features.filter((f) => matchesFilter(f, filter));
  return { type: "FeatureCollection", features };
}
