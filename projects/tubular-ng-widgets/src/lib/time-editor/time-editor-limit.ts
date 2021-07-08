import ttime, { DateAndTime, DateTime, DateTimeField, isDate, Timezone } from '@tubular/time';
import { isNumber, isString, toNumber } from '@tubular/util';
import { abs, sign } from '@tubular/math';

export class TimeEditorLimit {
  tai?: number;
  text: string;
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
      let dt: DateTime;

      if (asTai) {
        this.tai = limit;
        this.utc = (dt = new DateTime({ tai: limit })).utcMillis;
      }
      else {
        this.tai = (dt = new DateTime(limit)).taiMillis;
        this.utc = limit;
      }

      this.text = dt.format(limit % 1000 === 0 ? ttime.DATETIME_LOCAL_SECONDS : ttime.DATETIME_LOCAL_MS);
      this.year = new Date(this.utc).getFullYear();
    }
    else {
      this.text = limit = limit.trim().replace(/[-:]$/, '');

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
        this.wallTime = dateTime.wallTimeSparse;

        if (!limit.includes(':')) {
          if (!/-[^-]+-/.test(limit))
            this.wallTime.d = undefined;
          else if (!/[\sT]\d+$/i.test(limit))
            this.wallTime.hrs = undefined;
          else
            this.wallTime.min = undefined;
        }
        else if (!/:[^:]+:/.test(limit))
          this.wallTime.sec = undefined;
        else if (!limit.includes('.'))
          this.wallTime.millis = undefined;

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
      return dateTime.isTai() ? new DateTime({ tai: this.tai }).wallTimeSparse :
        dateTime.clone().setUtcMillis(this.utc).wallTimeSparse;

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

    return dateTime.wallTimeSparse;
  }
}
