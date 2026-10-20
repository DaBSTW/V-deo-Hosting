// Iconos SVG inline (trazo 1.8, estilo uniforme, sin dependencias).
type P = { className?: string };
const base = "h-4 w-4";

function Svg({ className = base, children, fill }: P & { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const UploadIcon = (p: P) => (
  <Svg {...p}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>
);
export const CodeIcon = (p: P) => <Svg {...p}><path d="m8 9-4 3 4 3m8-6 4 3-4 3M14 5l-4 14" /></Svg>;
export const LinkIcon = (p: P) => (
  <Svg {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></Svg>
);
export const PlayIcon = (p: P) => (
  <Svg {...p} fill><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" /></Svg>
);
export const XIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const FolderIcon = (p: P) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></Svg>
);
export const FolderPlusIcon = (p: P) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm9 3v6m-3-3h6" /></Svg>
);
export const LibraryIcon = (p: P) => (
  <Svg {...p}><path d="M4 6h16M6 3h12M3 9.5A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-9Zm7.5 2v5l4-2.5-4-2.5Z" /></Svg>
);
export const InboxIcon = (p: P) => (
  <Svg {...p}><path d="M4 13h4l1.5 2.5h5L16 13h4M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z" /></Svg>
);
export const GridIcon = (p: P) => (
  <Svg {...p}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></Svg>
);
export const ListIcon = (p: P) => <Svg {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></Svg>;
export const SearchIcon = (p: P) => <Svg {...p}><path d="m20 20-4.2-4.2M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" /></Svg>;
export const MenuIcon = (p: P) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const DotsIcon = (p: P) => (
  <Svg {...p} fill><path d="M12 7a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 7Zm0 6.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm0 6.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" /></Svg>
);
export const CheckIcon = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const PencilIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4" /></Svg>;
export const ExternalIcon = (p: P) => <Svg {...p}><path d="M14 4h6v6m0-6-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Svg>;
export const LogoutIcon = (p: P) => <Svg {...p}><path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" /></Svg>;
export const AlertIcon = (p: P) => <Svg {...p}><path d="M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Svg>;
export const FilmIcon = (p: P) => (
  <Svg {...p}><path d="M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4" /></Svg>
);
export const ChevronDownIcon = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const MoveIcon = (p: P) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm8 6h6m-2-2 2 2-2 2" /></Svg>
);
export const DownloadIcon = (p: P) => (
  <Svg {...p}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></Svg>
);
