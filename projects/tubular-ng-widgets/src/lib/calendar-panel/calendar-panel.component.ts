import { Component, EventEmitter, forwardRef, Input, OnDestroy, Output } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { div_rd, max, min } from '@tubular/math';
import { CalendarType, DateTime, defaultLocale, getStartOfWeek, GregorianChange, Timezone, YMDDate } from '@tubular/time';
import { clone, isEqual, isObject, isString, noop, toBoolean, toNumber } from '@tubular/util';
import { Subscription, timer } from 'rxjs';
import { SafeHtml } from '@angular/platform-browser';

const CLICK_REPEAT_DELAY = 500;
const CLICK_REPEAT_RATE  = 100;

export interface CalendarDateInfo extends YMDDate {
  text: string;
  dayLength: number;
  highlight?: boolean;
  shortDay?: boolean;
  longDay?: boolean;
  otherMonth?: boolean;
  voidDay?: boolean;
}

export type DayDecorator = (dateInfo: CalendarDateInfo) => string | SafeHtml;

// noinspection JSUnusedGlobalSymbols
enum SelectMode { DAY, MONTH, YEAR, DECADE, CENTURY, MILLENNIUM, MODE_COUNT }
const multiplier = [0, 1, 1, 10, 100, 1000];

@Component({
  selector: 'tbw-calendar',
  templateUrl: './calendar-panel.component.html',
  styleUrls: ['./calendar-panel.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CalendarPanelComponent), multi: true }]
})
export class CalendarPanelComponent implements ControlValueAccessor, OnDestroy {
  private ymd: YMDDate = { y: 2021, m: 1, d: 1 };
  private _gregorianChange: GregorianChange;
  private _showDst = false;
  private _minYear = 1;
  private _maxYear = 9999;
  private _firstDay = getStartOfWeek(defaultLocale);
  private baseValue = [0, 0, 0];
  private dateTime: DateTime = new DateTime();
  private onTouchedCallback: () => void = noop;
  private onChangeCallback: (_: any) => void = noop;
  private timerSubscription: Subscription;
  private pendingDelta = 0;
  private pendingEvent: MouseEvent = null;
  private _weekDayFormat = 'ddd';
  private _yearMonthFormat = 'MMM Y';

  @Input() backgroundDecorator: DayDecorator;
  calendar: CalendarDateInfo[][] = [];
  cols = 4;
  daysOfWeek: string[] = [];
  @Input() foregroundDecorator: DayDecorator;
  highlightItem = '';
  modeCount = SelectMode.MODE_COUNT;
  months: string[] = [];
  rows = 3;
  selectMode = SelectMode.DAY;
  title = ['', '', ''];

  @Output() dayClick = new EventEmitter();

  constructor() {
    this.updateDayHeadings();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  get value(): YMDDate { return this.ymd; }
  set value(newYMD: YMDDate) {
    if (!isEqual(this.ymd, newYMD)) {
      this.ymd = newYMD;
      this.updateCalendar();
      this.onChangeCallback(newYMD);
    }
  }

  writeValue(newYMD: YMDDate): void {
    if (!isEqual(this.ymd, newYMD)) {
      this.ymd = newYMD;
      this.updateCalendar();
    }
  }

  registerOnChange(fn: any): void {
    this.onChangeCallback = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouchedCallback = fn;
  }

  get timezone(): Timezone { return this.dateTime.timezone; }
  @Input() set timezone(newZone: Timezone) {
    if (this.dateTime.timezone !== newZone) {
      this.dateTime.timezone = newZone;
      this.updateCalendar();
    }
  }

  get gregorianChangeDate(): GregorianChange { return this._gregorianChange; }
  @Input() set gregorianChangeDate(newChange: GregorianChange) {
    if (!isEqual(this._gregorianChange, newChange)) {
      this._gregorianChange = newChange;

      if (isObject(newChange) || isString(newChange))
        this.dateTime.setGregorianChange(newChange as YMDDate | string);
      else if (newChange === CalendarType.PURE_GREGORIAN)
        this.dateTime.setPureGregorian(true);
      else if (newChange === CalendarType.PURE_JULIAN)
        this.dateTime.setPureJulian(true);
      else
        this.dateTime.setGregorianChange(1582, 10, 15);

      this.updateCalendar();
    }
  }

  get showDst(): boolean | string { return this._showDst; }
  @Input() set showDst(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    if (this._showDst !== newValue) {
      this._showDst = newValue;
      this.updateCalendar();
    }
  }

  get minYear(): number | string { return this._minYear; }
  @Input() set minYear(year: number | string) {
    if (isString(year))
      year = toNumber(year);

    if (this._minYear !== year) {
      this._minYear = year;
    }
  }

  get maxYear(): number | string { return this._maxYear; }
  @Input() set maxYear(year: number | string) {
    if (isString(year))
      year = toNumber(year);

    if (this._maxYear !== year) {
      this._maxYear = year;
    }
  }

  get firstDay(): number { return this._firstDay; }
  @Input() set firstDay(dayOfWeek: number) {
    if (this._firstDay !== dayOfWeek) {
      this._firstDay = dayOfWeek;
      this.updateDayHeadings();
      this.updateCalendar();
    }
  }

  get weekDayFormat(): string { return this._weekDayFormat; }
  @Input() set weekDayFormat(value: string) {
    if (this._weekDayFormat !== value) {
      this._weekDayFormat = value;
      this.updateDayHeadings();
    }
  }

  get yearMonthFormat(): string { return this._yearMonthFormat; }
  @Input() set yearMonthFormat(value: string) {
    if (this._yearMonthFormat !== value) {
      this._yearMonthFormat = value;
      this.updateTitle();
    }
  }

  updateDayHeadings(): void {
    // Produce calendar day-of-week header using arbitrary days which start on the given first day of the week.
    this.daysOfWeek = [];

    for (let d = 1; d <= 7; ++d)
      this.daysOfWeek.push(new DateTime({ y: 2017, m: 1, d: d + this._firstDay, hrs: 12 },
        'UTC', 'en-us').format(this._weekDayFormat));
  }

  updateCalendar(): void {
    const year  = this.ymd?.y ?? 2021;
    const month = this.ymd?.m ?? 1;
    const day   = this.ymd?.d ?? 1;
    const calendar = this.dateTime.getCalendarMonth(year, month, this._firstDay);

    this.calendar = [];
    calendar.forEach((date: CalendarDateInfo, index: number) => {
      const dayLength = this.dateTime.getMinutesInDay(date.y, date.m, Math.abs(date.d));
      const row = Math.floor(index / 7);
      const col = index % 7;

      date.dayLength = dayLength;
      date.text = String(date.d);
      date.otherMonth = (date.m !== month);
      date.highlight = (date.m === month && date.d === day);

      if (date.y < this._minYear || date.y > this._maxYear) {
        date.d = 0;
        date.text = '\u2022'; // bullet
        date.voidDay = true;
      }
      else if (dayLength === 0) {
        date.d = 0;
        date.text = '\u2716'; // heavy x
        date.voidDay = true;
      }
      else if (this._showDst && dayLength < 1440) {
        date.shortDay = true;
      }
      else if (this._showDst && dayLength > 1440) {
        date.longDay = true;
      }

      if (col === 0)
        this.calendar[row] = [];

      this.calendar[row][col] = date;
    });

    this.updateTitle();
    this.updateAltTable();
  }

  private updateTitle(): void {
    this.title[0] = new DateTime({ y: this.ymd?.y ?? 2021, m: this.ymd?.m ?? 1 }, 'UTC', 'en-us').format(this._yearMonthFormat);
  }

  reset(): void {
    this.selectMode = SelectMode.DAY;
    this.updateCalendar();
  }

  stopTimer(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = undefined;

      if (this.pendingDelta) {
        this.onClick(this.pendingEvent, this.pendingDelta);
        this.pendingEvent = null;
        this.pendingDelta = 0;
      }
    }
  }

  onTouchStart(evt: TouchEvent, delta: number): void {
    if (evt.cancelable) evt.preventDefault();
    this.onMouseDown(null, delta, true);
  }

  onMouseDown(event: MouseEvent, delta: number, fromTouch = false): void {
    if (!this.timerSubscription && (!event || event.button === 0)) {
      this.pendingEvent = event;
      this.pendingDelta = fromTouch ? delta : 0;

      this.timerSubscription = timer(CLICK_REPEAT_DELAY, CLICK_REPEAT_RATE).subscribe(() => {
        this.pendingEvent = null;
        this.pendingDelta = fromTouch ? 0 : delta;
        this.onClick(event, delta);
      });
    }
  }

  onClick(event: MouseEvent, delta: number): void {
    const date: YMDDate = clone(this.ymd);

    if (this.selectMode === SelectMode.DAY) {
      if (event?.altKey)
        date.y += delta * 10;
      else if (event?.shiftKey)
        date.y += delta;
      else
        date.m += delta;
    }
    else if (this.selectMode === SelectMode.MONTH)
      date.y += delta;
    else
      date.y += delta * min(multiplier[this.selectMode] * 10, 1000);

    if (date.y < this._minYear || date.y === this._minYear && date.m < 1) {
      date.y = this._minYear;
      date.m = 1;
      date.d = 1;
    }
    else if (date.y > this._maxYear || date.y === this._maxYear && date.m > 12) {
      date.y = this._maxYear;
      date.m = 12;
      date.d = 31;
    }

    this.value = this.dateTime.normalizeDate(date);
  }

  onDayClick(dateInfo: CalendarDateInfo): void {
    if (dateInfo.d > 0) {
      this.value = { y: dateInfo.y, m: dateInfo.m, d: dateInfo.d };
      this.dayClick.emit(dateInfo.d);
    }
  }

  onAltCellClick(value: string): void {
    const date: YMDDate = clone(this.ymd);
    const month = this.months.indexOf(value);

    if (month > 0)
      date.m = month;
    else
      date.y = toNumber(value);

    const newDate = this.dateTime.normalizeDate(date);

    newDate.y = min(max(newDate.y, this._minYear), this._maxYear);
    this.value = newDate;
    --this.selectMode;
    this.updateAltTable();
  }

  onTitleClick(): void {
    this.selectMode = (this.selectMode + 1) % SelectMode.MODE_COUNT;
    this.updateAltTable();
  }

  counter(length: number): number[] {
    return [...Array(length)].map((a, i) => i);
  }

  getTableValue(row: number, col: number, mode: number): string {
    if (mode === SelectMode.DAY)
      return '';
    else if (mode === SelectMode.MONTH) {
      const m = row * 4 + col + 1;

      return (this.months[m] = new DateTime({ y: 4000, m, hrs: 12 }).format('MMM'));
    }

    let index = row * this.cols + col;

    if (index === 8 || index === 11)
      return '';

    index -= +(index > 7);

    const value = this.baseValue[mode] + index * multiplier[mode];
    const minn = div_rd(this._minYear, multiplier[mode]) * multiplier[mode];
    const maxx = (div_rd(this._maxYear - 1, multiplier[mode]) + 1) * multiplier[mode];

    if ((minn <= value && value <= maxx))
      return min(max(value, this._minYear), this._maxYear).toString();
    else
      return '';
  }

  private updateAltTable(): void {
    const mode = this.selectMode;

    if (mode !== SelectMode.DAY) {
      this.title[mode] = min(max(div_rd(this.ymd.y, multiplier[mode]) * multiplier[mode], this._minYear), this._maxYear).toString();
      this.baseValue[mode] = div_rd(this.ymd.y, multiplier[mode] * 10) * multiplier[mode] * 10;

      if (mode === SelectMode.MONTH)
        this.highlightItem = this.months[this.ymd.m];
      else
        this.highlightItem = this.title[mode];
    }
  }

  getDayCellBackgroundContent(dateInfo: CalendarDateInfo): string | SafeHtml {
    if (this.backgroundDecorator)
      return this.backgroundDecorator(dateInfo);
    else
      return '';
  }

  getDayCellForegroundContent(dateInfo: CalendarDateInfo): string | SafeHtml {
    if (this.foregroundDecorator)
      return this.foregroundDecorator(dateInfo);
    else
      return '';
  }
}
