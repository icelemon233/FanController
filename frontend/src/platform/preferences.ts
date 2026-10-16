export interface ChoicePreference<T extends string> {
  read(): { value: T; issue?: string };
  write(value: T): string | undefined;
}

export function createChoicePreference<T extends string>(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  valid: (value: unknown) => value is T,
  fallback: T,
): ChoicePreference<T> {
  return {
    read() {
      try {
        const value = getStorage().getItem(key);
        if (value === null) return { value: fallback };
        if (valid(value)) return { value };
        return { value: fallback, issue: '显示偏好无效，已使用默认选项。' };
      } catch {
        return { value: fallback, issue: '无法读取显示偏好，本次使用默认选项。' };
      }
    },
    write(value) {
      try {
        getStorage().setItem(key, value);
        return undefined;
      } catch {
        return '选项已在本次会话中生效，但未能保存到此电脑。';
      }
    },
  };
}
