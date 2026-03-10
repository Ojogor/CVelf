export type SkillMatch = {
  skill: string;
  weight: "required" | "preferred";
  matched: boolean;
};

export type ResumeParsed = {
  raw: string;
  cleaned: string;
  headline?: string;
  summary?: string;
  skills: string[];
  certifications: string[];
  experienceBullets: string[];
  projectBullets: string[];
};

export type JobParsed = {
  raw: string;
  cleaned: string;
  title?: string;
  company?: string;
  requiredLines: string[];
  preferredLines: string[];
  responsibilities: string[];
  skillsRequired: string[];
  skillsPreferred: string[];
  keywords: string[];
};

export type ScoreBreakdown = {
  requiredSkillsScore: number;
  preferredSkillsScore: number;
  experienceScore: number;
  titleScore: number;
  semanticScore: number;
  penalties: number;
  overallScore: number;
  requiredSkillsMatched: number;
  requiredSkillsTotal: number;
  preferredSkillsMatched: number;
  preferredSkillsTotal: number;
};

export type ScoreResult = {
  overallScore: number;
  breakdown: ScoreBreakdown;
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  missingPreferredSkills: string[];
  suggestions: string[];
  parsed: {
    job: JobParsed;
    resume: ResumeParsed;
  };
};

