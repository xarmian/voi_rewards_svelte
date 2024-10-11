export function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w]+/g, '-');
}

export function truncate(text: string, length: number) {
  return text.length > length ? text.substring(0, length - 3) + '...' : text;
}

export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 }
  ];

  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count >= 1) {
      return count === 1 ? `1 ${interval.label} ago` : `${count} ${interval.label}s ago`;
    }
  }

  return 'just now';
}

export const truncateAddress = (address: string, chars = 6) => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};
