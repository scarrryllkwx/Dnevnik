// Шаблон. Скопируйте в accounts.js и впишите свои данные.
// Пароли храним как SHA-256-хеш (passwordHash), а не в открытом виде.
// Получить хеш для пароля: откройте hash-tool.html, введите пароль, скопируйте результат.

const ACCOUNTS = [
  { name: "Имя", email: "you@example.com", passwordHash: "ВСТАВЬТЕ_SHA256_ХЕШ_ПАРОЛЯ" },
];

// Email учителя по умолчанию (должен совпадать с одним из email выше).
const DEFAULT_TEACHER_EMAIL = "you@example.com";
