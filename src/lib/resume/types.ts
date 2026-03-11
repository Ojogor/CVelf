export type SectionId = "header" | "summary" | "highlights" | "experience" | "projects" | "education" | "skills";

export type ResumeProfile = {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  linkedin?: string;
  github?: string;
  website?: string;
};

export type ResumeExperienceItem = {
  id: string;
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets: string[];
};

export type ResumeProjectItem = {
  id: string;
  name: string;
  dateRange?: string;
  bullets: string[];
  link?: string;
};

export type ResumeEducationItem = {
  id: string;
  school: string;
  degree?: string;
  location?: string;
  dateRange?: string;
  details?: string[];
};

export type ResumeSkillCategory = {
  id: string;
  category: string;
  items: string[];
};

export type ResumeData = {
  profile: ResumeProfile;
  summary?: string;
  experiences: ResumeExperienceItem[];
  projects?: ResumeProjectItem[];
  education?: ResumeEducationItem[];
  skills: ResumeSkillCategory[] | string[];
};

export type ResumeTemplate = {
  templateName: string;
  layout: {
    page: { size: "letter" | "a4"; fontSize: number; fontFamily: string };
    sections: SectionId[];
    theme: {
      primaryColor: string;
      accentColor: string;
      backgroundColor: string;
    };
  };
  sections?: Partial<Record<SectionId, any>>;
  renderRules?: {
    bulletStyle?: "dot" | "dash";
    dateAlignment?: "right" | "inline";
    sectionDivider?: string;
    maxBulletLength?: number;
  };
};

export type RenderReadyResume = {
  template: ResumeTemplate;
  data: ResumeData;
};

