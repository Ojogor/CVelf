import type { RenderReadyResume, ResumeData, ResumeTemplate } from "./types";

/**
 * Assemble a render-ready resume from data + template.
 * For now this is a thin wrapper; selection/tailoring logic can evolve here.
 */
export function buildTailoredResume(input: {
  resumeData: ResumeData;
  template: ResumeTemplate;
}): RenderReadyResume {
  return { data: input.resumeData, template: input.template };
}

