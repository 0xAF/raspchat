import { app, h } from 'hyperapp';
import actions from './actions';
import state from './state';
import view from './views';

const boundActions = app({ state, actions, view });
boundActions.config.load(window['RaspConfig']);
