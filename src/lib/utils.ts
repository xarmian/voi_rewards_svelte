import algosdk from "algosdk";

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w]+/g, '-');
}

export function truncate(text: string, length: number) {
  return text.length > length ? text.substring(0, length - 3) + '...' : text;
}

export function formatDate(date: Date, format: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if (format === 'MMM d') {
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const pad = (num: number): string => num.toString().padStart(2, '0');

  return format
    .replace(/yyyy/g, year.toString())
    .replace(/MM/g, pad(month))
    .replace(/M/g, month.toString())
    .replace(/dd/g, pad(day))
    .replace(/d/g, day.toString())
    .replace(/HH/g, pad(hours))
    .replace(/H/g, hours.toString())
    .replace(/mm/g, pad(minutes))
    .replace(/m/g, minutes.toString())
    .replace(/ss/g, pad(seconds))
    .replace(/s/g, seconds.toString());
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

const findCommonRatio = (a: number, totalSum: number, n: number) => {
  // Using numerical method (binary search) to find r
  // where a(1-r^n)/(1-r) = totalSum
  let left = 0.1;  // Lower bound for r
  let right = 2.0; // Upper bound for r
  const epsilon = 0.0000001; // Precision

  while (right - left > epsilon) {
    const mid = (left + right) / 2;
    const sum = a * (1 - Math.pow(mid, n)) / (1 - mid);
    
    if (sum < totalSum) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  return (left + right) / 2;
}

export const getTokensByEpoch = async (epoch: number) => {
  // tokens = 3000000 for epoch 1
  // tokens = a * r^(i-1)
  const a = 3_000_000;
  const totalSum = 1_000_000_000;
  const n = 1042;
  const r = findCommonRatio(a, totalSum, n);
  return Math.round(a * Math.pow(r, epoch - 1));
}

interface ExtrapolatedRewards {
  projectedTotalBlocks: number;
  projectedRewardPerBlock: number;
}

export function extrapolateRewardPerBlock(
  currentTotalBlocks: number,
  rewardPool: number,
  selectedDate?: string
): ExtrapolatedRewards {
  const now = new Date();
  let endDate: Date;

  if (selectedDate) {
    // Parse the date from selectedDate format "testnet2_YYYYMMDD"
    endDate = new Date(
      parseInt(selectedDate.substring(9, 13)),
      parseInt(selectedDate.substring(13, 15)) - 1,
      parseInt(selectedDate.substring(15, 17))
    );
    endDate.setUTCHours(23, 59, 59, 999);
  } else {
    // Calculate next Tuesday midnight UTC
    endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() + ((2 + 7 - endDate.getUTCDay()) % 7));
    endDate.setUTCHours(23, 59, 59, 999);
  }

  const remainingTime = endDate.getTime() - now.getTime();
  const remainingDays = Math.max(0, remainingTime / (1000 * 60 * 60 * 24));
  const currentBlocksPerDay = currentTotalBlocks / (7 - remainingDays);
  const projectedTotalBlocks = Math.round(currentTotalBlocks + (currentBlocksPerDay * remainingDays));
  const projectedRewardPerBlock = rewardPool / projectedTotalBlocks;

  return {
    projectedTotalBlocks,
    projectedRewardPerBlock
  };
}

export async function getBlocksInRange(startBlock: number, endBlock: number): Promise<number> {
    try {
        // If the blocks are invalid, return 0
        if (!startBlock || !endBlock || startBlock > endBlock) {
            return 0;
        }

        // Calculate the actual number of blocks in the range
        const blocksProduced = endBlock - startBlock + 1;
        
        // Cap at 7200 blocks (maximum possible in an epoch)
        return Math.min(blocksProduced, 7200);
    } catch (error) {
        console.error('Error calculating blocks in range:', error);
        return 0;
    }
}

export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

interface GlobalStateValue {
  bytes: string;
  type: 1 | 2;  // 1 for bytes, 2 for uint
  uint: number;
}

interface GlobalStateEntry {
  key: string;
  value: GlobalStateValue;
}

export function decodeGlobalState(globalState: GlobalStateEntry[]): { key: string; value: string | number }[] {
  // Fields that should always be treated as numbers
  const numericFields = new Set(['total_supply', 'swap_fee', 'decimals', 'beta_id', 'alpha_id', 'factory']);

  return globalState.map(item => {
    // Decode the base64 key
    const decodedKey = Buffer.from(item.key, 'base64').toString('utf8');
    
    // Initialize with a default value
    let decodedValue: string | number = '';
    
    if (item.value.type === 1) {  // bytes
      if (item.value.bytes) {
        const buffer = Buffer.from(item.value.bytes, 'base64');
        
        // If it's a numeric field or single byte, decode as number
        if (numericFields.has(decodedKey) || buffer.length === 1) {
          if (buffer.length === 1) {
            decodedValue = buffer.readUInt8(0);
          } else if (buffer.length === 8) {
            // For 8-byte numbers (like total_supply), read as BigInt and convert to number
            decodedValue = Number(buffer.readBigUInt64BE(0));
          }
        } else {
          // Try to decode as UTF-8 string
          try {
            decodedValue = buffer.toString('utf8').split('\u0000').join('');
          } catch {
            // If UTF-8 decoding fails, use empty string
            decodedValue = '';
          }
        }
      }
    } else if (item.value.type === 2) {  // uint
      decodedValue = item.value.uint;
    }

    // If we still have an empty value for a numeric field, use the uint value
    if (decodedValue === '' && numericFields.has(decodedKey)) {
      decodedValue = item.value.uint;
    }

    return {
      key: decodedKey,
      value: decodedValue
    };
  });
}

export function formatAddress(address: string, length: number = 8): string {
    if (!address) return '';
    if (address.length <= length * 2) return address;
    return `${address.slice(0, length)}...${address.slice(-length)}`;
} 