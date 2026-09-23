import PieceList from '../_ui/PieceList';

export default function HumanizerList() {
  return (
    <div className="list-page">
      <h1 className="page-title">Humanizer</h1>
      <PieceList tab="humanizer" empty="Nothing to check yet." />
    </div>
  );
}
