import PieceList from '../_ui/PieceList';

export default function Writing() {
  return (
    <div className="list-page">
      <h1 className="page-title">Writing</h1>
      <PieceList tab="writing" empty="Nothing to write yet. Start from an outline." />
    </div>
  );
}
