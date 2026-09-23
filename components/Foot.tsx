import MessageBox from './MessageBox';
import Subscribe from './Subscribe';

export default function Foot({ postId }: { postId?: string }) {
  return (
    <footer className="foot wrap">
      <MessageBox postId={postId} />
      <div style={{ marginTop: 36 }}>
        <Subscribe />
      </div>
    </footer>
  );
}
