import { DateAndTime, DateTime, DateTimeField, isDate, Timezone } from '@tubular/time';
import { isNumber, isString, toNumber } from '@tubular/util';
import { abs, sign } from '@tubular/math';

export function sparse(dt: DateAndTime): DateAndTime {
  const { y, m, d, hrs, min, sec, millis } = dt;

  return { y, m, d, hrs, min, sec, millis };
}

export class TimeEditorLimit {
  tai?: number;
  utc?: number;
  wallTime?: DateAndTime;
  year?: number;

  constructor(limit: Date | number | string, private asLow = false, asTai = false) {
    if (limit == null || limit === '')
      limit = asLow ? '-9999' : '9999';
    else if (isNumber(limit) && abs(limit) < 10000)
      limit = limit.toString();
    else if (isDate(limit)) {
      asTai = false;
      limit = limit.getTime();
    }
    else if (isString(limit) && /^[-+]?\d{5,}$/.test(limit.trim()))
      limit = toNumber(limit);

    if (isNumber(limit)) {
      if (asTai) {
        this.tai = limit;
        this.utc = new DateTime({ tai: limit }).utcMillis;
      }
      else {
        this.tai = new DateTime(limit).taiMillis;
        this.utc = limit;
      }

      this.year = new Date(this.utc).getFullYear();
    }
    else {
      limit = limit.trim();
      const dateTime = new DateTime(limit);

      if (!dateTime.valid)
        throw new Error(`Time limit "${limit}" not valid`);

      if (/[_a-z]$/i.test(limit)) {
        this.tai = dateTime.taiMillis;
        this.utc = dateTime.utcMillis;
        this.year = dateTime.wallTime.y;
      }
      else if (/^[\d]+$/.test(limit)) {
        this.year = dateTime.wallTime.y;
        this.wallTime = { y : this.year };
      }
      else {
        this.wallTime = sparse(dateTime.wallTime);

        if (!limit.includes(':')) {
          if (!/-[^-]+-/.test(limit))
            this.wallTime.d = undefined;
          else if (!/[\sT]\d+$/i.test(limit))
            this.wallTime.hrs = undefined;
          else
            this.wallTime.min = undefined;
        }
        else if (!limit.includes('.'))
          this.wallTime.millis = undefined;
        else if (!/:[^:]+:/.test(limit))
          this.wallTime.sec = undefined;

        this.year = this.wallTime.y;
      }

      if (!this.wallTime)
        this.wallTime = { y: this.year };
    }
  }

  compare(dateTime: DateTime): number {
    if (this.wallTime == null)
      return sign(this.tai - dateTime.taiMillis);

    const wt = dateTime.wallTime;
    const diffs = [
      this.wallTime.y - wt.y,
      this.wallTime.m - wt.m,
      this.wallTime.d - wt.d,
      this.wallTime.hrs - wt.hrs,
      this.wallTime.min - wt.min,
      this.wallTime.sec - wt.sec,
      this.wallTime.millis - wt.millis,
    ];

    for (const diff of diffs) {
      if (isNaN(diff))
        return 0;
      else if (diff !== 0)
        return sign(diff);
    }

    return 0;
  }

  getWallTime(dateTime: DateTime): DateAndTime {
    if (this.wallTime == null)
      return sparse(dateTime.isTai() ?
        new DateTime({ tai: this.tai }).wallTime :
        dateTime.clone().setUtcMillis(this.utc).wallTime);

    dateTime = new DateTime(this.wallTime, Timezone.ZONELESS);

    if (!this.asLow) {
      if (this.wallTime.m == null)
        dateTime = dateTime.endOf(DateTimeField.YEAR);
      else if (this.wallTime.d == null)
        dateTime = dateTime.endOf(DateTimeField.MONTH);
      else if (this.wallTime.hrs == null)
        dateTime = dateTime.endOf(DateTimeField.DAY);
      else if (this.wallTime.min == null)
        dateTime = dateTime.endOf(DateTimeField.HOUR);
      else if (this.wallTime.sec == null)
        dateTime = dateTime.endOf(DateTimeField.MINUTE);
      else if (this.wallTime.millis == null)
        dateTime = dateTime.endOf(DateTimeField.SECOND);
    }

    return sparse(dateTime.wallTimeShort);
  }
}
