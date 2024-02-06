import { getCharacterShortName, getStageShortName } from "@vinceau/slp-realtime";
import type { GameStartType } from "@slippi/slippi-js";
import type { InputButtonCombo, RealTimeInputEvents, RealTimeGameEvents } from "@vinceau/slp-realtime";
import { exists } from "common/utils";
import type { Observable } from "rxjs";
import { merge } from "rxjs";
import { map, filter } from "rxjs/operators";

import { playerFilter } from "./operators/player";
import type { EventConfig, EventEmit, EventManagerConfig, InputEventFilter } from "./types";
import { InputEvent } from "./types";

export const readInputsConfig = (
  inputs: RealTimeInputEvents,
  config: EventManagerConfig,
  game: RealTimeGameEvents
): Observable<EventEmit> => {
  return readButtonComboEvents(config, inputs, game.start$);
};

interface InputEventConfig extends EventManagerConfig {
  events: Array<
    EventConfig & {
      type: InputEvent;
      filter?: InputEventFilter;
    }
  >;
}

const readButtonComboEvents = (
  eventConfig: EventManagerConfig,
  inputs: RealTimeInputEvents,
  game$: Observable<GameStartType>
): Observable<EventEmit> => {
  // Handle game start events
  const observables: Observable<EventEmit>[] = (eventConfig as InputEventConfig).events
    .filter(filterValidButtonCombo) // We must have a valid filter
    .map((event) => {
      let duration = 1;
      if (exists(event.filter.duration) && event.filter.duration > 1) {
        duration = Math.floor(event.filter.duration);
      }

      const buttons = event.filter.combo;
      let base$: Observable<InputButtonCombo> = inputs.buttonCombo(buttons, duration);

      if (event.filter) {
        if (event.filter.playerNames) {
          // Replace the base observable with one that only looks at certain players
          base$ = inputs.playerNameButtonCombo({
            namesToFind: event.filter.playerNames,
            buttons,
            duration,
            fuzzyNameMatch: event.filter.fuzzyNameMatch,
          });
        } else if (event.filter.playerIndex !== undefined) {
          // Handle num players filter
          base$ = base$.pipe(playerFilter(event.filter.playerIndex, eventConfig.variables));
        }
      }

      let currentGameStart: any = null;
      return merge(base$.pipe(map((x) => ({ src: "base", x: x }))), game$.pipe(map((x) => ({ src: "game", x: x }))))
        .pipe(
          filter((x) => {
            if (x.src == "game") {
              currentGameStart = { ...x.x };
              if (currentGameStart.stageId) {
                currentGameStart.stageName = getStageShortName(currentGameStart.stageId);
              }
              for (let y of currentGameStart.players) {
                y.characterName = getCharacterShortName(y.characterId);
              }
              return false;
            } else {
              return true;
            }
          })
        )
        .pipe(
          map(
            (context): EventEmit => ({
              id: event.id,
              type: event.type,
              payload: { gameDetails: currentGameStart, ...context.x },
            })
          )
        );
    });
  return merge(...observables);
};

function filterValidButtonCombo(
  event: EventConfig & { type: InputEvent; filter?: InputEventFilter }
): event is EventConfig & { type: InputEvent; filter: InputEventFilter } {
  return (
    event.type === InputEvent.BUTTON_COMBO &&
    exists(event.filter) &&
    event.filter.combo &&
    event.filter.combo.length > 0
  ); // We must have a valid filter
}
