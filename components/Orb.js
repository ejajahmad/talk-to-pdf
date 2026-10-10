// The assistant's face: a soft gradient ball with two white eyes. Pure CSS, see .orb in globals.css.
// size: "small" (next to answers), "medium" (empty chat), "large" (welcome screen)
export default function Orb({ size = "small" }) {
  return (
    <span className={`orb ${size}`} aria-hidden="true">
      <span className="eye" />
      <span className="eye" />
    </span>
  );
}
