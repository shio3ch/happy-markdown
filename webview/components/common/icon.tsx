const icons = {
  files: <><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9M5 13a7 7 0 0 0 12 5l3-3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeClosed: <><path d="M3 3l18 18M9 5c7-2 13 7 13 7a19 19 0 0 1-3 4M15 19C8 21 2 12 2 12a19 19 0 0 1 4-5" /></>,
  save: <><path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/></>,
  undo: <><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/></>,
  redo: <><path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/></>,
  inline: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></>,
  bullet: <><path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/></>,
  ordered: <><path d="M10 5h11M10 12h11M10 19h11M2 3h2v6M2 9h4m-4 5c0-3 4-3 4 0 0 2-4 3-4 6h4"/></>,
  quote: <><path d="M4 6h6v7H5c0 3 2 4 4 5M14 6h6v7h-5c0 3 2 4 4 5"/></>,
  hr: <><path d="M3 12h18"/></>,
  link: <><path d="m10 13 4-4m-7 6-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></>,
  code: <><path d="M7 3H3v18h4m10-18h4v18h-4M10 8l-4 4 4 4m4-8 4 4-4 4"/></>,
  pencil: <><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/></>,
};

export function Icon({ name }: { name: keyof typeof icons }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}
