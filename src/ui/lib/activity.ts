import type { ActivitySpec, Confidence } from "../api.ts";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  guessing: "Guessing",
  likely: "Fairly sure",
  sure: "Sure",
};

export function componentValue(spec: ActivitySpec, type: string): unknown {
  const index = spec.components.findIndex((component) => component.type === type);
  return index === -1 ? undefined : index;
}

export function initialValues(spec: ActivitySpec): unknown[] {
  return spec.components.map((component) => {
    if (component.type === "mcq_single") return null;
    if (component.type === "tf_multi") return component.statements?.map(() => null) ?? [];
    if (component.type === "cloze") return (component.text?.match(/\{\{[^{}]+\}\}/g) ?? []).map(() => "");
    if (component.type === "confidence_rating") return undefined;
    return "";
  });
}

export function buildResponse(spec: ActivitySpec, values: unknown[]): {
  components: unknown[];
  confidence?: Confidence;
  think_aloud?: string;
} {
  const confidenceIndex = componentValue(spec, "confidence_rating");
  const thinkIndex = componentValue(spec, "think_aloud");
  const confidence = typeof confidenceIndex === "number" ? values[confidenceIndex] : undefined;
  const thinkAloud = typeof thinkIndex === "number" ? values[thinkIndex] : undefined;
  return {
    components: values,
    confidence:
      confidence === "guessing" || confidence === "likely" || confidence === "sure"
        ? confidence
        : undefined,
    think_aloud: typeof thinkAloud === "string" ? thinkAloud : undefined,
  };
}

export function missingAnswers(spec: ActivitySpec, values: unknown[]): string[] {
  const missing: string[] = [];
  spec.components.forEach((component, index) => {
    const value = values[index];
    const label =
      component.type === "mcq_single"
        ? "the question"
        : component.type === "tf_multi"
          ? "every statement"
          : component.type === "cloze"
            ? "every blank"
            : component.type === "theory"
              ? "the written answer"
              : component.type === "think_aloud"
                ? "the think-aloud box"
                : component.type === "confidence_rating"
                  ? "the confidence rating"
                  : component.type.replaceAll("_", " ");
    if (component.type === "mcq_single" && value === null) missing.push(label);
    if (component.type === "tf_multi" && Array.isArray(value) && value.some((item) => item === null)) {
      missing.push(label);
    }
    if (component.type === "cloze" && Array.isArray(value) && value.some((item) => !String(item).trim())) {
      missing.push(label);
    }
    if (component.type === "theory" && !String(value ?? "").trim()) missing.push(label);
    if (component.type === "think_aloud") {
      const words = String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (words < (component.min_words ?? 10)) missing.push(label);
    }
    if (component.type === "confidence_rating" && !["guessing", "likely", "sure"].includes(String(value))) {
      missing.push(label);
    }
  });
  return missing;
}
