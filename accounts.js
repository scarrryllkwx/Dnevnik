// ВАЖНО: этот файл с почтами и хешами паролей вынесен отдельно и добавлен в .gitignore.
// Не коммитьте его. Шаблон без реальных данных — accounts.example.js.
//
// Пароли НЕ хранятся в открытом виде: поле passwordHash — это SHA-256 от пароля.
// Чтобы получить хеш для нового пароля, откройте hash-tool.html.

const ACCOUNTS = [
  // Все текущие пароли — "1111" (хеш ниже). Поменяйте через hash-tool.html.
  { name: "Фил", email: "im@scarrry.ru", passwordHash: "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c" },
  { name: "Володя", email: "vovanchik043@mail.ru", passwordHash: "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c" },
  { name: "Арина", email: "a.filippowa2010@yandex.ru", passwordHash: "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c" },
  { name: "Алена", email: "aliena.mishina34@gmail.com", passwordHash: "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c" },
];

const DEFAULT_TEACHER_EMAIL = "aliena.mishina34@gmail.com";
