import React, { memo, useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  title?: string;
}

const StarRating = memo(({ value, onChange, size = 14, title }: StarRatingProps) => {
  const [hover, setHover] = useState<number | null>(null);
  const readOnly = !onChange;
  const shown = hover ?? value;

  return (
    <span
      className={`star-rating ${readOnly ? 'read-only' : ''}`}
      title={title || (readOnly ? `Rating: ${value}/5` : 'Click to rate this branch (click the same star to clear)')}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className={`star ${star <= shown ? 'filled' : ''}`}
          style={{ fontSize: size }}
          onMouseEnter={readOnly ? undefined : () => setHover(star)}
          onClick={readOnly ? undefined : (e) => {
            e.stopPropagation();
            onChange!(star === value ? 0 : star);
          }}
        >
          {star <= shown ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
});

StarRating.displayName = 'StarRating';

export default StarRating;
