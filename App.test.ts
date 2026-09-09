import { getTabs, productionTabs } from './App';

describe('navigation isolation', () => {
  it('keeps production navigation at exactly four canonical tabs', () => {
    expect(getTabs(false)).toEqual(productionTabs);
    expect(getTabs(false).map((tab) => tab.key)).toEqual([
      'discover',
      'groups',
      'help',
      'profile',
    ]);
  });

  it('adds Auth Test only in development', () => {
    expect(getTabs(true).map((tab) => tab.key)).toEqual([
      'discover',
      'groups',
      'help',
      'profile',
      'auth-test',
    ]);
  });
});
