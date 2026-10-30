import {
  newText,
  type TitleScene,
  type TitleProject,
  type TitleText,
} from "./model";
export const TEMPLATES = [
  {
    id: "opening",
    name: "The Last Horizon",
    category: "Movie opening",
    duration: 7,
    color: "#cdb18a",
    bg: "#101b2a",
    sample: "THE LAST\nHORIZON",
  },
  {
    id: "production",
    name: "Northstar Pictures",
    category: "Production intro",
    duration: 6,
    color: "#e5d2a4",
    bg: "#0b2433",
    sample: "✦\nNORTHSTAR",
  },
  {
    id: "character",
    name: "The Wanderer",
    category: "Actor introduction",
    duration: 6,
    color: "#e9ced4",
    bg: "#271420",
    sample: "ALEX\nRIVERA",
  },
  {
    id: "credits",
    name: "The Final Frame",
    category: "Scrolling end credits",
    duration: 14,
    color: "#e4e7ed",
    bg: "#101114",
    sample: "CAST & CREW\nA FILM BY YOU",
  },
  {
    id: "crew",
    name: "Made Together",
    category: "Cast & crew list",
    duration: 8,
    color: "#d6c4a5",
    bg: "#172523",
    sample: "MADE\nTOGETHER",
  },
  {
    id: "reveal",
    name: "Beyond",
    category: "Dramatic reveal",
    duration: 6,
    color: "#e4d9c3",
    bg: "#111118",
    sample: "B E Y O N D",
  },
  {
    id: "documentary",
    name: "Field Notes",
    category: "Documentary intro",
    duration: 8,
    color: "#26372e",
    bg: "#e9dfcc",
    sample: "Stories\nworth telling.",
  },
  {
    id: "social",
    name: "Bold by Design",
    category: "Social animation",
    duration: 5,
    color: "#ffffff",
    bg: "#563caa",
    sample: "BOLD\nBY DESIGN",
  },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];
export function template(id: TemplateId): TitleScene {
  const info = TEMPLATES.find((t) => t.id === id)!,
    d = info.duration;
  const text = (patch: Partial<TitleText>) => newText(d, patch);
  const scene: TitleScene = {
    id: crypto.randomUUID(),
    name: info.name,
    duration: d,
    background: {
      kind: "gradient",
      color: info.bg,
      secondary: "#03070e",
      angle: 135,
      grain: true,
      vignette: true,
      fit: "contain",
      loop: false,
    },
    text: [],
  };
  switch (id) {
    case "opening":
      scene.text = [
        text({
          text: "AN ECONTENT ORIGINAL",
          font: "sans",
          fontSize: 8,
          tracking: 0.3,
          y: 0.22,
          height: 0.08,
        }),
        text({
          text: "The Last\nHorizon",
          fontSize: 49,
          weight: 400,
          y: 0.36,
          height: 0.4,
          tracking: 0.06,
          entrance: "slide-up",
        }),
        text({
          text: "EVERY END IS A NEW BEGINNING",
          font: "sans",
          fontSize: 7,
          tracking: 0.24,
          y: 0.83,
          height: 0.08,
          start: 1.2,
        }),
      ];
      break;
    case "production":
      scene.background.secondary = "#173e50";
      scene.text = [
        text({
          text: "✦",
          fontSize: 49,
          y: 0.13,
          height: 0.2,
          entrance: "zoom",
        }),
        text({
          text: "NORTHSTAR",
          font: "sans",
          fontSize: 28,
          weight: 700,
          tracking: 0.15,
          y: 0.45,
          height: 0.16,
          entrance: "letter-reveal",
          animationDuration: 1.4,
        }),
        text({
          text: "P I C T U R E S",
          font: "sans",
          fontSize: 10,
          y: 0.66,
          height: 0.08,
          start: 1,
        }),
      ];
      break;
    case "character":
      scene.text = [
        text({
          text: "INTRODUCING",
          font: "sans",
          fontSize: 8,
          tracking: 0.3,
          y: 0.23,
          height: 0.08,
        }),
        text({
          text: "Alex Rivera",
          fontSize: 43,
          y: 0.4,
          height: 0.22,
          entrance: "word-reveal",
        }),
        text({
          text: "as The Wanderer",
          fontSize: 17,
          y: 0.67,
          height: 0.12,
          start: 0.8,
        }),
      ];
      break;
    case "credits":
      scene.background.kind = "solid";
      scene.text = [
        text({
          text: "CAST\n\nAlex Rivera\nThe Wanderer\n\nJordan Lee\nThe Navigator\n\nCREW\n\nDirected by You\nProduced by Your Studio\n\nTHANK YOU FOR WATCHING",
          font: "sans",
          fontSize: 15,
          tracking: 0.02,
          lineHeight: 1.6,
          y: 0,
          height: 0.95,
          entrance: "credit-roll",
          exit: "none",
          shadow: false,
          creditSpeed: 19,
        }),
      ];
      break;
    case "crew":
      scene.text = [
        text({ text: "MADE TOGETHER", fontSize: 28, y: 0.17, height: 0.16 }),
        text({
          text: "DIRECTED BY\nYour Name",
          font: "sans",
          fontSize: 14,
          lineHeight: 1.8,
          x: 0.08,
          width: 0.4,
          y: 0.47,
          height: 0.35,
          entrance: "slide-up",
        }),
        text({
          text: "PRODUCED BY\nYour Studio",
          font: "sans",
          fontSize: 14,
          lineHeight: 1.8,
          x: 0.52,
          width: 0.4,
          y: 0.47,
          height: 0.35,
          start: 0.5,
          entrance: "slide-up",
        }),
      ];
      break;
    case "reveal":
      scene.text = [
        text({
          text: "BEYOND",
          fontSize: 43,
          tracking: 0.16,
          y: 0.4,
          height: 0.2,
          entrance: "letter-reveal",
          animationDuration: 2,
        }),
        text({
          text: "THE UNKNOWN AWAITS",
          font: "sans",
          fontSize: 8,
          tracking: 0.3,
          y: 0.7,
          height: 0.1,
          start: 2,
        }),
      ];
      break;
    case "documentary":
      scene.background = {
        ...scene.background,
        kind: "solid",
        vignette: false,
      };
      scene.text = [
        text({
          text: "AN ORIGINAL DOCUMENTARY",
          color: info.color,
          font: "sans",
          fontSize: 8,
          align: "left",
          x: 0.12,
          y: 0.16,
          height: 0.1,
          shadow: false,
        }),
        text({
          text: "Stories\nworth telling.",
          color: info.color,
          fontSize: 40,
          weight: 400,
          tracking: -0.02,
          align: "left",
          x: 0.12,
          width: 0.78,
          y: 0.35,
          height: 0.4,
          entrance: "typewriter",
          animationDuration: 1.6,
          shadow: false,
        }),
        text({
          text: "The people. The places. The truth.",
          color: info.color,
          font: "sans",
          fontSize: 9,
          tracking: 0,
          align: "left",
          x: 0.12,
          y: 0.84,
          height: 0.08,
          shadow: false,
        }),
      ];
      break;
    case "social":
      scene.background.secondary = "#a657d3";
      scene.text = [
        text({
          text: "YOUR STUDIO / ORIGINALS",
          font: "sans",
          fontSize: 8,
          tracking: 0.13,
          y: 0.12,
          height: 0.1,
        }),
        text({
          text: "BOLD\nBY DESIGN",
          font: "sans",
          fontSize: 40,
          weight: 900,
          tracking: -0.03,
          color: "#ffffff",
          y: 0.32,
          height: 0.38,
          entrance: "zoom",
        }),
        text({
          text: "MAKE YOUR NEXT MOVE",
          font: "sans",
          fontSize: 9,
          y: 0.8,
          height: 0.1,
          entrance: "slide-up",
          start: 0.8,
        }),
      ];
      break;
  }
  return scene;
}
export function initialProject(): TitleProject {
  return {
    version: 1,
    title: "Untitled film",
    ratio: "16:9",
    scenes: [
      template("opening"),
      template("character"),
      template("credits"),
    ].map((scene, i) => ({
      ...scene,
      id: "titles-initial-" + i,
      text: scene.text.map((t, j) => ({
        ...t,
        id: "titles-initial-" + i + "-text-" + j,
      })),
    })),
    output: { shortEdge: 1080, fps: 24 },
  };
}
