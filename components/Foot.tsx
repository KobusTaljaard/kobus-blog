import MessageBox from './MessageBox';
import Subscribe from './Subscribe';

/** Home page: private note + subscribe. Post pages: subscribe only (comments sit above). */
export default function Foot({ note = true }: { note?: boolean }) {
  return (
    <footer className="foot wrap">
      {note && <MessageBox />}
      <div style={{ marginTop: note ? 36 : 0 }}>
        <Subscribe />
      </div>
    </footer>
  );
}
