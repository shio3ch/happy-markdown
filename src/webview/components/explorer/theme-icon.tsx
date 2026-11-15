export function ThemeIcon({ icon }: { icon: { light: string; dark: string } }) {
  return <span className="file-icon" aria-hidden="true"><img className="icon-light" src={icon.light} alt="" /><img className="icon-dark" src={icon.dark} alt="" /></span>;
}
