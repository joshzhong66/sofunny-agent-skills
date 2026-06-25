# SocialDataX 能力清单

## 1. `search_notes` 笔记搜索

用途：
按关键词搜索小红书笔记。

必填参数：

- `keyword`

常见可选参数：

- `page`
- `sort_type`
- `note_type`
- `publish_time_range`
- `max_items`
- `auto_paginate`

推荐默认值：

- `page=1`
- `sort_type=general`
- `note_type=all`
- `publish_time_range=all`
- `max_items=20`
- `auto_paginate=true`

## 2. `search_hot_list` 热榜搜索

用途：
获取热榜内容。

常见可选参数：

- `max_items`

## 3. `get_note_detail` 笔记详情

用途：
获取单条笔记详情。

至少提供一个：

- `note_id`
- `note_url`

## 4. `get_user_info` 博主信息

用途：
获取博主资料。

至少提供一个：

- `user_id`
- `profile_url`

## 5. `list_user_notes` 博主笔记列表

用途：
获取某个博主的笔记列表。

至少提供一个：

- `user_id`
- `profile_url`

常见可选参数：

- `page_token`
- `max_items`
- `auto_paginate`

## 6. `get_note_comments` 评论列表

用途：
获取某条笔记的评论。

至少提供一个：

- `note_id`
- `note_url`

常见可选参数：

- `page_token`
- `max_items`
- `auto_paginate`

## 7. `get_note_sub_comments` 评论回复

用途：
获取某条一级评论下的回复。

必填参数：

- `note_id`
- `comment_id`

常见可选参数：

- `page_token`
- `max_items`
- `auto_paginate`

## 重要提示

- `search_notes` 最核心的是 `keyword`，不要替用户随便猜
- `get_note_detail` 和 `get_note_comments` 可以用 `note_id` 或 `note_url`
- `get_note_sub_comments` 需要同时给 `note_id` 和 `comment_id`
- 评论和回复类操作建议先从较小的 `max_items` 开始
