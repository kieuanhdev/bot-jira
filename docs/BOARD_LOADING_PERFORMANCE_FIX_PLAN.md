# Ke hoach toi uu thoi gian tai Board

> Ngay lap: 2026-10-13  
> Pham vi: `/board`, `/api/issues`, board bootstrap, client bundle va Docker deployment  
> Trang thai: Proposed  
> Muc tieu: Giam thoi gian tu luc mo Board den khi du lieu dau tien co the tuong tac

## 1. Tom tat van de

Board cham khong chi xuat hien trong `next dev`. Phep do tren production image va
du lieu hien tai cho thay cac nguyen nhan chinh la:

1. Client phai cho `/api/me/preferences` truoc khi bat dau tai issues va statuses.
2. Team mode co the tao request trung: request dau voi `assignee=me`, sau do effect
   doi filter sang `assignee=ALL` va tai lai.
3. Query `/api/issues` dang doc ca truong JSON `raw` du khong tra truong nay ve client.
4. Board cho phep tai toi 1.000 task trong mot request.
5. Nhieu thanh phan chi dung khi tuong tac van nam trong initial client bundle.
6. Cac request dong qua domain Cloudflare co latency cao hon LAN va waterfall lam
   latency bi cong don.
7. Image container co the cu hon source neu khoi dong Compose ma khong build lai.

## 2. Baseline da do

### 2.1 API trong container

| Kich ban | Ket qua |
|---|---:|
| Board API warm, tai khoan khong co task | 64-70 ms |
| EPM, `assignee=ALL`, 1.000 task | 215-276 ms |
| Response EPM, 1.000 task | Khoang 771 KB |
| MHRM, `assignee=ALL`, 1.000 task | 158-176 ms |
| CICM, `assignee=ALL`, 891 task | 161-210 ms |

### 2.2 Prisma issue query

| Cach query | Du lieu Prisma doc | Cold | Warm |
|---|---:|---:|---:|
| Hien tai, chi `omit description` | Khoang 5,7 MB | 535 ms | 194-197 ms |
| Explicit `select` | Khoang 748 KB | 99 ms | 57-61 ms |

### 2.3 Client va network

- Initial JavaScript cua `/board`: khoang 1.068 KB raw, 331 KB gzip.
- Request public qua Cloudflare co TTFB khoang 0,6 giay khi chua tai su dung ket noi.
- Static chunks duoc Cloudflare cache va tai nhanh; API user-specific khong duoc cache.
- Client hien co it nhat hai vong request noi tiep:

```text
Board mount
  -> GET /api/me/preferences
  -> GET /api/issues + GET /api/board/statuses
```

## 3. Muc tieu va performance budget

### 3.1 Muc tieu chuc nang

1. Mot lan mo Board chi tao mot request `/api/issues` cho project duoc chon.
2. Team mode phai dung `assignee=ALL` ngay tu request dau tien.
3. Doi project khong duoc gui filter cua project cu sang project moi.
4. JSON contract cua `/api/issues` khong thay doi ngoai cac field noi bo khong duoc tra.
5. Board van hoat dong dung voi board, list va team view.
6. Khong lam thay doi quyen truy cap project hay pham vi du lieu theo user.

### 3.2 Ngan sach hieu nang

| Chi so | Muc tieu |
|---|---:|
| So request `/api/issues` khi mount | 1 |
| Prisma DB duration, EPM 1.000 task, warm | < 120 ms |
| Board content warm trong Docker LAN | < 800 ms |
| Board content warm qua public domain | < 1,5 giay |
| Initial JavaScript `/board` | < 250 KB gzip |
| Payload `/api/issues`, 1.000 task | < 1 MB raw JSON |

## 4. Giai doan 1 - Giam du lieu query

### 4.1 Pham vi

- `src/lib/issues/list-route-service.ts`
- Test cua `/api/issues` va list route service

### 4.2 Thay doi

1. Thay `omit: { description: true }` bang `select` liet ke chinh xac cac field
   ma response mapper su dung.
2. Khong doc `raw`, `description`, `storyField` va metadata khong can thiet.
3. Voi `aiScore`, chi lay score va decision moi nhat duoc response su dung.
4. Voi `branches`, chi lay `prState` va `merged` sau khi ap dung dieu kien hien tai.
5. Tao hang `ISSUE_LIST_SELECT` co type Prisma de query va mapper de kiem soat.
6. Khong thay doi response contract cua frontend.

### 4.3 Kiem thu

- API van tra du cac field cua `IssueItem`.
- Prisma query khong chua `raw`, `description` hoac `storyField`.
- Mapping AI decision va delivery khong thay doi.
- Benchmark lai EPM voi `assignee=ALL&limit=1000`.

### 4.4 Tieu chi hoan thanh

- DB duration warm cua EPM 1.000 task nho hon 120 ms.
- Ket qua API khong sai lech so task, total, AI score hoac delivery state.

## 5. Giai doan 2 - Loai request trung

### 5.1 Pham vi

- `src/app/(app)/board/lib/board-filter-controller.ts`
- `src/app/(app)/board/board-client.tsx`
- `src/app/(app)/board/lib/board-filter-controller.test.ts`

### 5.2 Thay doi

1. Tao ham thuan `loadInitialBoardFilters` de doc project, stored filters va Team
   mode trong mot buoc.
2. Ap dung Team mode vao filter truoc khi enable issue query.
3. Khong dung effect sau mount de chuyen `me` thanh `ALL`.
4. Them trang thai `filtersReady`; issue query chi duoc bat khi project va filter
   da on dinh.
5. Khi doi project, khoi tao filter project moi truoc khi bat query key moi.
6. Giu cache React Query cua project cu de quay lai nhanh ma khong tai lai neu con fresh.

### 5.3 Kiem thu

- Stored Team mode tao request dau tien voi `assignee=ALL`.
- Personal mode tao request dau tien voi `assignee=me`.
- Mot lan mount chi tao mot issue query key.
- Doi project nhanh khong tao request voi project/filter bi tron.
- URL filters van co uu tien cao hon local storage.

### 5.4 Tieu chi hoan thanh

- Khong con chuoi request `me -> ALL`.
- Khong co response cua project cu ghi de project moi.

## 6. Giai doan 3 - Loai waterfall preferences

### 6.1 Pham vi du kien

- `src/app/(app)/board/page.tsx`
- `src/app/(app)/board/board-client.tsx`
- Module moi `src/lib/board/bootstrap.ts`
- Service dung chung cho projects, preferences va user status

### 6.2 Thiet ke

1. Server component doc session va goi board bootstrap service.
2. Bootstrap gom:
   - project preferences cua user;
   - danh sach project dang active;
   - open counts;
   - Jira identity va quyen Team mode;
   - people-field capability cua project ban dau neu query nay du nho.
3. Truyen `initialBootstrap` vao `BoardClient`.
4. Khoi tao `selectedProject` ngay tu server data.
5. Dung `initialData` cho cac React Query lien quan va refresh ngam theo `staleTime`.
6. Khong goi HTTP noi bo tu server component; tach service de route va page cung dung.
7. Khong cache bootstrap chung giua user; du lieu phai duoc scope theo session.

### 6.3 Luong dich

```text
Server render
  -> board bootstrap co san

Client hydrate
  -> GET /api/issues + GET /api/board/statuses ngay lap tuc
  -> refresh bootstrap metadata trong nen khi stale
```

### 6.4 Kiem thu

- Bootstrap chi tra project ma user duoc phep truy cap.
- User A khong the nhan preferences hoac count rieng cua user B.
- Project trong URL hop le co uu tien so voi stored project.
- Project khong hop le fallback dung preference dau tien.
- Hydration khong tao mismatch hoac request preferences bat buoc truoc issues.

### 6.5 Tieu chi hoan thanh

- Issues va statuses bat dau ngay sau hydration.
- Khong con waterfall `preferences -> issues/statuses`.

## 7. Giai doan 4 - Giam initial client bundle

### 7.1 Pham vi

- `src/app/(app)/board/board-client.tsx`
- `src/app/(app)/board/board-quick-panel.tsx`
- `src/app/(app)/board/board-list-view.tsx`
- `src/app/(app)/board/board-team-view.tsx`
- `src/app/(app)/board/lib/board-dnd-hook.ts`
- File moi `src/app/(app)/board/loading.tsx`

### 7.2 Thay doi

1. Dynamic import Quick Panel, chi tai khi user mo mot task.
2. Dynamic import List View, chi tai khi view dang la `list`.
3. Dynamic import Team View, chi tai khi Team mode dang bat.
4. Chuyen DnD hook vao Kanban boundary de `@dnd-kit` khong nam trong initial
   bundle khi view khong can drag-and-drop.
5. Them route-level `loading.tsx` de navigation phan hoi ngay.
6. Dung Skeleton hien co, khong them spinner text.

### 7.3 Kiem thu

- Board, list va team view deu render dung sau dynamic import.
- Mo Quick Panel lan dau co loading state on dinh, khong lam layout nhay.
- Keyboard navigation va drag-and-drop khong regression.
- Build production va tinh lai tong chunk gzip cua route `/board`.

### 7.4 Tieu chi hoan thanh

- Initial route JavaScript nho hon 250 KB gzip.
- Quick Panel va DnD code khong nam trong initial chunk khi chua dung.

## 8. Giai doan 5 - Giam canh tranh va tang observability

### 8.1 Thay doi

1. Chi tai `/api/issues/filters` sau khi core issues da co du lieu, hoac khi user
   bat dau tuong tac voi filter.
2. Dua people-field capability vao bootstrap neu khong lam bootstrap cham dang ke.
3. Bo sung `Server-Timing` cho:
   - `/api/me/preferences`;
   - `/api/projects`;
   - `/api/me/status`;
   - `/api/issues/filters`;
   - `/api/projects/[key]/people-fields`.
4. Ghi structured timing cho board bootstrap va issues route.
5. Them client performance marks:
   - navigation start;
   - bootstrap ready;
   - issues response;
   - first board content rendered.
6. Khong ghi token, issue description, raw Jira payload hoac thong tin nhay cam.

### 8.2 Tieu chi hoan thanh

- Co the tach ro network, session, DB va client render latency tu mot lan mo Board.
- Khong can suy doan nguyen nhan chi dua tren tong request duration.

## 9. Docker va trien khai

1. Build image moi bang:

```bash
podman compose up -d --build
```

2. Xac nhan version Next va revision cua image sau build.
3. Gan commit SHA hoac build revision vao image label va health/metrics response.
4. Kiem tra `db`, `web` va `worker` deu healthy truoc khi benchmark.
5. Chay benchmark qua hai duong:
   - LAN truc tiep vao cong container;
   - public domain qua Cloudflare.
6. Khong dung image cu khi source, package lock hoac board code da thay doi.
7. Sau rollout, theo doi it nhat mot chu ky cache va mot chu ky Jira sync.

## 10. Thu tu trien khai

| Thu tu | Hang muc | Uu tien | Ly do |
|---:|---|:---:|---|
| 1 | Explicit Prisma select | P0 | Pham vi nho, giam DB I/O lon nhat |
| 2 | Khoi tao filter va Team mode dung ngay tu dau | P0 | Loai request issues trung |
| 3 | Server bootstrap | P0 | Loai mot vong network noi tiep |
| 4 | Lazy-load UI modules | P1 | Giam download, parse va hydration |
| 5 | Defer metadata queries | P1 | Giam canh tranh luc initial load |
| 6 | Timing va Docker revision | P1 | Do dung regression va rollout |

## 11. Rui ro va bien phap kiem soat

| Rui ro | Anh huong | Kiem soat |
|---|---|---|
| Explicit select thieu field | Card hoac edit action loi | Contract test cho moi field `IssueItem` |
| Bootstrap bi cache sai user | Ro ri du lieu | Scope theo session, khong shared cache |
| Local storage gay hydration mismatch | Request trung hoac UI nhay | Doc state client mot lan, gate bang `filtersReady` |
| Dynamic import tach sai boundary | Van tai DnD/Quick Panel som | Kiem tra production manifest |
| Team mode doi semantics | Hien sai pham vi task | Unit test personal/team/stored state |
| Worker sync canh tranh DB | p95 tang theo chu ky sync | Benchmark khi worker idle va dang sync |
| Image cu duoc khoi dong lai | Fix khong co hieu luc | Build revision va deployment checklist |

## 12. Validation bat buoc

Sau moi giai doan:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Benchmark cuoi cung phai bao gom:

1. Personal mode voi EPM.
2. Team mode voi EPM va 1.000 task.
3. Doi nhanh EPM sang MHRM roi quay lai.
4. Cold browser cache va warm browser cache.
5. Docker LAN va public Cloudflare URL.
6. Worker idle va worker dang dong bo Jira.

## 13. Definition of Done

- [ ] `/api/issues` khong doc `raw`, `description` hoac field khong dung.
- [ ] Mot lan mount chi tao mot issue request.
- [ ] Stored Team mode dung `ALL` ngay tu request dau tien.
- [ ] Khong con waterfall bat buoc qua `/api/me/preferences`.
- [ ] EPM 1.000 task co DB duration warm nho hon 120 ms.
- [ ] Board content warm duoi 800 ms trong Docker LAN.
- [ ] Board content warm duoi 1,5 giay qua public domain.
- [ ] Initial JavaScript `/board` nho hon 250 KB gzip.
- [ ] Khong co regression board/list/team/quick-panel/drag-and-drop.
- [ ] Tat ca test, lint, typecheck va production build deu pass.
- [ ] Image moi co revision xac dinh va ca ba service deu healthy.

