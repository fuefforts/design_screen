<script setup lang="ts">
import LeftPannel from './layout/LeftPannel.vue';
import EditeScreen from './layout/EditeScreen.vue';
import RightPannel from './layout/RightPannel.vue';
</script>
<template>
    <div class="screen_page">
        <div class="header">预留header处理</div>
        <div class="content">
            <LeftPannel />
            <EditeScreen />
            <RightPannel />
        </div>
    </div>
</template>

<style lang="scss" scoped>
.screen_page {
    width: 100%;
    height: 100vh;
    background-color: $color-background;
    display: flex;
    flex-direction: column;

    .header {
        width: 100vw;
        display: flex;
        height: 40px;
        background-color: $color-background;
        position: relative;
        z-index: 2;
        color: aliceblue;
        justify-content: center;
        border-bottom: 1px solid $color-border;
    }

    .content {
        flex: 1;
        display: grid;
        grid-template-columns: 300px 1fr 301px;
        position: relative;
        width: 100%;
    }
}
</style>
