import PieceList from '../_ui/PieceList';

export default function Outlines() {
  return (
    <div className="list-page">
      <h1 className="page-title">Outlines</h1>
      <PieceList tab="outlines" empty="No outlines yet. Upload an original source to begin." />
    </div>
  );
}
