import { AppController } from '../src/app.controller';

describe('AppController', () => {
  it('reports API health', () => {
    expect(new AppController().health()).toEqual({ status: 'ok', service: 'relayops-api' });
  });
});
