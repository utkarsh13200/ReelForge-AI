export type BundledTrack = {
  id: string;
  name: string;
  url: string;
  mood: string;
};

export const BUNDLED_MUSIC: BundledTrack[] = [
  {
    id: "ambient-focus",
    name: "Ambient Focus",
    url: "/music/ambient-focus.mp3",
    mood: "Calm · modern",
  },
  {
    id: "uplift-drive",
    name: "Uplift Drive",
    url: "/music/uplift-drive.mp3",
    mood: "Motivational · bright",
  },
  {
    id: "soft-story",
    name: "Soft Story",
    url: "/music/soft-story.mp3",
    mood: "Warm · narrative",
  },
];
