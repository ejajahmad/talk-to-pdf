// The assistant's face: a soft gradient ball with two white eyes. Pure CSS, see .orb in globals.css.
// size: "small" (next to answers), "button" (voice button), "medium" (empty chat), "large" (welcome screen)
// thinking: v8: the colors swirl while the AI is writing an answer
export default function Orb({ size = "small", thinking = false }) {
  return (
    <span className={`orb ${size} ${thinking ? "thinking" : ""}`} aria-hidden="true">
      <span className="eye" />
      <span className="eye" />
    </span>
  );
}
