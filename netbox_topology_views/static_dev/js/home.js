var graph = null;
var container = null;
var csrftoken = null;
var nodes = new vis.DataSet();
var edges = new vis.DataSet();
var options = {
    interaction: {
        hover: true,
        hoverConnectedEdges: true,
        multiselect: true
    },
    nodes: {
        shape: 'image',
        brokenImage: '../../static/netbox_topology_views/img/role-unknown.png',
        size: 35,
        font: {
            multi: 'md',
            face: 'helvetica',
        },
    },
    edges: {
        length: 100,
        width: 2,
        font: {
            face: 'helvetica',
        },
    },
    physics: {
        solver: 'forceAtlas2Based'
    }
};

function iniPlotboxIndex() {
    document.addEventListener('DOMContentLoaded', function () {
        container = document.getElementById('visgraph');
        csrftoken = jQuery("[name=csrfmiddlewaretoken]").val();
        startLoadSearchBar();
        handleButtonPress();
    }, false);
}

function startLoadSearchBar() {
    $('#device-roles').select2({
        allowClear: true,
        placeholder: "---------",
        theme: "bootstrap",
        multiple: true,
        ajax: {
            url: "../../api/dcim/device-roles/?brief=true",
            dataType: "json",
            type: "GET",
            data: function (params) {
                var queryParameters = {
                    term: params.term
                }
                return queryParameters;
            },
            processResults: function (data) {
                return {
                    results: $.map(data.results, function (item) {
                        return {
                            text: item.name,
                            id: item.id
                        }
                    })
                };
            }
        }
    });
    $('#sites').select2({
        allowClear: true,
        placeholder: "---------",
        theme: "bootstrap",
        multiple: true,
        ajax: {
            url: "../../api/dcim/sites/?brief=true",
            dataType: "json",
            type: "GET",
            data: function (params) {

                var queryParameters = {
                    term: params.term
                }
                return queryParameters;
            },
            processResults: function (data) {
                return {
                    results: $.map(data.results, function (item) {
                        return {
                            text: item.name,
                            id: item.id
                        }
                    })
                };
            }
        }
    });

    var deviceRolesSelect = $('#device-roles');
    $.ajax({
        type: 'GET',
        url: '../../api/plugins/topology-views/preselectdeviceroles/'
    }).then(function (data) {
        $.each(data.results, function (index, device_role_to_preload) {
            var option = new Option(device_role_to_preload.name, device_role_to_preload.id, true, true);
            deviceRolesSelect.append(option).trigger('change');
            deviceRolesSelect.trigger({
                type: 'select2:select',
                params: {
                    data: device_role_to_preload
                }
            });
        });
    });
}

function handleButtonPress() {
    $("#search-form").submit(function (event) {
        $("#status").html('<span class="label  label-info">Loading data</span>');
        event.preventDefault();
        var value = $("#name").val();
        var value2 = $("#device-roles").val();
        var value3 = $("#sites").val();
        $.ajax({
            type: "POST",
            url: "../../api/plugins/topology-views/search/search/",
            data: JSON.stringify({
                'name': value,
                'devicerole': value2,
                'sites': value3
            }),
            headers: { "X-CSRFToken": csrftoken },
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data_result) {
                $("#status").html('<span class="label  label-info">Drawing network</span>');
                graph = null;
                nodes = new vis.DataSet();
                edges = new vis.DataSet();
                graph = new vis.Network(container, { nodes: nodes, edges: edges }, options);
                $.each(data_result["nodes"], function (index, device) {
                    nodes.add(device);
                });
                $.each(data_result["edges"], function (index, edge) {
                    edges.add(edge);
                });
                graph.fit();

                graph.on('afterDrawing', function () {
                    $("#status").html('<span class="label label-success">Ready</span>');
                });

                graph.on("dragEnd", function (params) {
                    dragged = this.getPositions(params.nodes);
                    $.each(dragged, function (node_id, coordinates) {
                        $("#coordstatus").html('');
                        if ($('#checkSaveCoordinates').is(":checked")) {
                            nodes.update({ id: node_id, physics: false });
                            $.ajax({
                                url: "../../api/plugins/topology-views/save-coords/save_coords/",
                                type: 'POST',
                                dataType: 'json',
                                headers: { "X-CSRFToken": csrftoken },
                                contentType: "application/json; charset=utf-8",
                                data: JSON.stringify({
                                    'node_id': node_id,
                                    'x': coordinates.x,
                                    'y': coordinates.y
                                }),
                                error: function (error_result) {
                                    $("#coordstatus").html('<span class="label label-warning">Failed to update coordinates</span>');
                                },
                                success: function (data_result) {
                                    $("#coordstatus").html('<span class="label label-success">Updated coordinates</span>');
                                },
                            });
                        }
                    });
                });
            },
            error: function (error_result) {
                $("#status").html('<span class="label label-warning">Something went wrong</span>');
            },
        });
    });
}
